import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/playwright/session";
import { scrapeTugasSubmissions, buildAssignFolderName } from "@/lib/playwright/ut-tugas";
import { saveTugasSubmissions } from "@/lib/tugas";
import { getCourse } from "@/lib/courses";
import { listSessions } from "@/lib/sessions";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  assignId: z.string().min(1),
  downloadFiles: z.boolean().optional().default(true),
  collectScope: z.enum(["all", "requiresGrading"]).optional().default("all"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { credentialId, courseId, assignId, downloadFiles, collectScope } = parsed.data;

  try {
    const session = await getSession(credentialId);
    logger.info(
      `Collecting tugas ${assignId} (${collectScope})${downloadFiles ? "" : " (skip file download)"}`,
    );

    const [course, sessions] = await Promise.all([
      getCourse(credentialId, courseId),
      listSessions(credentialId, courseId),
    ]);
    const tugasActivity = sessions
      .flatMap((s) => s.tugas)
      .find((t) => t.url.includes(`id=${assignId}`));
    const folderName = buildAssignFolderName(assignId, course?.name, tugasActivity?.name);

    const submissions = await scrapeTugasSubmissions(
      session.page,
      assignId,
      credentialId,
      downloadFiles,
      collectScope,
      folderName,
    );
    await saveTugasSubmissions(credentialId, courseId, assignId, submissions, {
      preserveExistingFilePaths: !downloadFiles || collectScope !== "all",
    });

    logger.ok(`Collected ${submissions.length} submissions for tugas ${assignId}`);
    return NextResponse.json({ ok: true, count: submissions.length });
  } catch (err) {
    logger.err(err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
