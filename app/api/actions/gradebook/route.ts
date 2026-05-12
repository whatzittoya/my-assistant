import { NextResponse } from "next/server";
import { z } from "zod";
import { getCourse } from "@/lib/courses";
import { saveGradebookSnapshot } from "@/lib/gradebook";
import { getSession } from "@/lib/playwright/session";
import { scrapeGradebook } from "@/lib/playwright/ut-gradebook";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { credentialId, courseId } = parsed.data;
  const course = await getCourse(credentialId, courseId);
  if (!course) return NextResponse.json({ error: "course not found" }, { status: 404 });

  try {
    const session = await getSession(credentialId);
    const snapshot = await scrapeGradebook(session.page, courseId);
    await saveGradebookSnapshot(credentialId, courseId, snapshot);
    logger.ok(`Saved gradebook snapshot for course ${courseId}`);
    return NextResponse.json({
      ok: true,
      itemCount: snapshot.items.length,
      studentCount: snapshot.students.length,
      collectedAt: snapshot.collectedAt,
    });
  } catch (err) {
    logger.err(err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
