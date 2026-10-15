import { NextResponse } from "next/server";
import { z } from "zod";
import { closeSession } from "@/lib/playwright/session";
import { acquireCredentialLock } from "@/lib/playwright/lock";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ credentialId: z.string().min(1) });

/**
 * Closes the shared browser for a credential so the next action relaunches it.
 *
 * A long scrape can leave the context wedged (UT expires the session, the
 * browser keeps a dead connection pool) and nothing else can recover it short
 * of restarting the dev server.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { credentialId } = parsed.data;

  const release = await acquireCredentialLock(credentialId);
  try {
    await closeSession(credentialId);
    logger.ok("Browser session reset — next action will relaunch and log in");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.err(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    release();
  }
}
