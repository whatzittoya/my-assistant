import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureLoggedIn } from "@/lib/playwright/session";
import { acquireCredentialLock } from "@/lib/playwright/lock";
import { refreshForumDiscussions } from "@/lib/diskusi-refresh";
import { getCredential } from "@/lib/credentials";
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

  const release = await acquireCredentialLock(credentialId);
  try {
    const session = await ensureLoggedIn(credentialId);
    const cred = await getCredential(credentialId);
    const results = await refreshForumDiscussions(
      session.page,
      credentialId,
      courseId,
      forumId,
      cred?.username,
    );

    logger.ok(`Forum ${forumId} refresh complete`);
    return NextResponse.json({ ok: true, total: results.length, results });
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
