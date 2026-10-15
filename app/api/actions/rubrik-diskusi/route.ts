import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureLoggedIn } from "@/lib/playwright/session";
import { acquireCredentialLock } from "@/lib/playwright/lock";
import { scrapeRubrikDiskusi } from "@/lib/playwright/ut-rubrik";
import { listSessions } from "@/lib/sessions";
import { saveRubrikFiles } from "@/lib/rubrik-diskusi";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  forumId: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { credentialId, courseId, forumId } = parsed.data;

  // The rubrik lives next to the forum in its course section, so we need the
  // section URL captured during the session scrape.
  const sessions = await listSessions(credentialId, courseId);
  const session = sessions.find((s) =>
    s.diskusi.some((d) => new URL(d.url).searchParams.get("id") === forumId),
  );
  if (!session) {
    return NextResponse.json(
      { error: "Session for this forum not found — collect sessions on the course page first" },
      { status: 400 },
    );
  }

  const release = await acquireCredentialLock(credentialId);
  try {
    const { page } = await ensureLoggedIn(credentialId);
    const files = await scrapeRubrikDiskusi(page, session.url, credentialId, forumId);
    await saveRubrikFiles(credentialId, courseId, forumId, files);

    logger.ok(`Rubrik for forum ${forumId}: ${files.length} file(s)`);
    return NextResponse.json({ ok: true, files, session: session.name });
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
