import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/playwright/session";
import { postTugasGrades } from "@/lib/playwright/ut-tugas-grade";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  credentialId: z.string().min(1),
  assignId: z.string().min(1),
  grades: z.array(
    z.object({
      userId: z.string().min(1),
      score: z.number().min(0).max(100),
      feedback: z.string(),
    }),
  ).min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, assignId, grades } = parsed.data;

  const MAX_ATTEMPTS = 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const session = await getSession(credentialId);
      logger.info(
        `Posting ${grades.length} grades for tugas ${assignId} (attempt ${attempt}/${MAX_ATTEMPTS})`,
      );

      const { results, saved } = await postTugasGrades(session.page, assignId, grades);

      const ok = results.filter((r) => r.status === "ok").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const errors = results.filter((r) => r.status === "error").length;

      logger.ok(`Done: ${ok} graded, ${skipped} skipped, ${errors} errors, saved=${saved}`);
      return NextResponse.json({ ok: saved, results, summary: { ok, skipped, errors } });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        logger.warn(`Attempt ${attempt} failed: ${msg}. Retrying...`);
      } else {
        logger.err(`All ${MAX_ATTEMPTS} attempts failed: ${msg}`);
      }
    }
  }
  return NextResponse.json(
    { error: lastErr instanceof Error ? lastErr.message : String(lastErr) },
    { status: 500 },
  );
}
