import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureLoggedIn } from "@/lib/playwright/session";
import { acquireCredentialLock } from "@/lib/playwright/lock";
import { refreshForumDiscussions } from "@/lib/diskusi-refresh";
import { listSessions } from "@/lib/sessions";
import { getCredential } from "@/lib/credentials";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 600; // whole course: one scrape per diskusi forum

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
});

type ForumOutcome = {
  forumId: string;
  name: string;
  total?: number;
  updated?: number;
  error?: string;
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { credentialId, courseId } = parsed.data;

  // Collect every diskusi forum from the stored sessions, deduped by forum id.
  const sessions = await listSessions(credentialId, courseId);
  const forums: { forumId: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    for (const d of s.diskusi) {
      const forumId = d.url.match(/[?&]id=(\d+)/)?.[1];
      if (forumId && !seen.has(forumId)) {
        seen.add(forumId);
        forums.push({ forumId, name: d.name });
      }
    }
  }

  if (forums.length === 0) {
    return NextResponse.json(
      { error: "No diskusi forums found. Run 'Collect sessions' first." },
      { status: 400 },
    );
  }

  const release = await acquireCredentialLock(credentialId);
  try {
    const session = await ensureLoggedIn(credentialId);
    const cred = await getCredential(credentialId);

    logger.info(`Refreshing ${forums.length} diskusi forums in course ${courseId}`);

    const results: ForumOutcome[] = [];
    for (const [i, f] of forums.entries()) {
      logger.info(`[${i + 1}/${forums.length}] ${f.name}`);
      try {
        const forumResults = await refreshForumDiscussions(
          session.page,
          credentialId,
          courseId,
          f.forumId,
          cred?.username,
        );
        results.push({
          forumId: f.forumId,
          name: f.name,
          total: forumResults.length,
          updated: forumResults.filter((r) => r.status === "updated").length,
        });
      } catch (err) {
        // Keep going — one broken forum shouldn't abort the rest of the course.
        const msg = err instanceof Error ? err.message : String(err);
        logger.err(`${f.name}: ${msg}`);
        results.push({ forumId: f.forumId, name: f.name, error: msg });
      }
    }

    const failed = results.filter((r) => r.error).length;
    logger.ok(
      `Course diskusi refresh complete — ${forums.length - failed}/${forums.length} forums ok`,
    );
    return NextResponse.json({ ok: true, total: forums.length, failed, results });
  } catch (err) {
    logger.err(err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    release();
  }
}
