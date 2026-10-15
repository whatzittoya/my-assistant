import { NextResponse } from "next/server";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { ensureLoggedIn } from "@/lib/playwright/session";
import { acquireCredentialLock } from "@/lib/playwright/lock";
import { collectCourseMaterial } from "@/lib/playwright/ut-material";
import { courseDir, renderInstructionMd, renderCourseReadme } from "@/lib/materi";
import { getCourse, updateCourseMateri } from "@/lib/courses";
import { listSemesters } from "@/lib/semesters";
import { logger } from "@/lib/activity-log";
import type { CollectedCourse } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 600; // whole course: one page load + downloads per section

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

  const [course, semesters] = await Promise.all([
    getCourse(credentialId, courseId),
    listSemesters(credentialId),
  ]);
  if (!course) return NextResponse.json({ error: "course not found" }, { status: 404 });

  const semesterName =
    semesters.find((s) => s.courseIds.includes(courseId))?.name ?? "Tanpa Semester";
  const outDir = courseDir(semesterName, course.name);

  const release = await acquireCredentialLock(credentialId);
  try {
    const session = await ensureLoggedIn(credentialId);
    const sessions = await collectCourseMaterial(session.page, course.url, outDir, credentialId);

    const collected: CollectedCourse = {
      courseId,
      courseName: course.name,
      semesterName,
      courseUrl: course.url,
      collectedAt: new Date().toISOString(),
      sessions,
    };

    // Write the Markdown + manifest for each session, then the course index.
    for (const s of sessions) {
      const dir = path.join(outDir, s.dirName);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "instruction.md"), renderInstructionMd(s, collected));
      fs.writeFileSync(
        path.join(dir, "manifest.json"),
        JSON.stringify({ ...s, courseName: course.name, collectedAt: collected.collectedAt }, null, 2),
      );
    }
    fs.writeFileSync(path.join(outDir, "README.md"), renderCourseReadme(collected));

    const relDir = path.relative(process.cwd(), outDir);
    await updateCourseMateri(credentialId, courseId, relDir);

    const totalFiles = sessions.reduce(
      (n, s) => n + s.activities.filter((a) => a.kind === "file").length,
      0,
    );
    const failed = sessions.filter((s) => s.error).length;
    logger.ok(`Material collected: ${sessions.length} sections, ${totalFiles} files → ${relDir}`);

    return NextResponse.json({
      ok: true,
      outDir: relDir,
      totalSections: sessions.length,
      totalFiles,
      failed,
      sessions: sessions.map((s) => ({
        section: s.section,
        name: s.name,
        dirName: s.dirName,
        items: s.activities.length,
        files: s.activities.filter((a) => a.kind === "file").length,
        error: s.error,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.err(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    release();
  }
}
