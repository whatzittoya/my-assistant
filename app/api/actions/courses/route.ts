import { NextResponse } from "next/server";
import { z } from "zod";
import { getCredentialWithSecret } from "@/lib/credentials";
import { ensureLoggedIn } from "@/lib/playwright/session";
import { collectCourses } from "@/lib/playwright/ut-courses";
import { listCourses, saveCourses } from "@/lib/courses";
import { acquireCredentialLock } from "@/lib/playwright/lock";
import {
  currentSemester,
  listSemesters,
  saveSemesterSnapshot,
  updateSemesterCourses,
} from "@/lib/semesters";

export const runtime = "nodejs";
export const maxDuration = 180;

const Body = z.object({
  credentialId: z.string().min(1),
  semesterId: z.string().min(1).optional(),
  createSemester: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cred = await getCredentialWithSecret(parsed.data.credentialId);
  if (!cred) return NextResponse.json({ error: "credential not found" }, { status: 404 });

  const release = await acquireCredentialLock(cred.id);
  try {
    const session = await ensureLoggedIn(cred.id);

    const [previousCourses, previousSemesters] = parsed.data.createSemester
      ? await Promise.all([listCourses(cred.id), listSemesters(cred.id)])
      : [[], []];
    const courses = await collectCourses(session.page);
    await saveCourses(cred.id, courses);

    let selectedSemesterId = parsed.data.semesterId;
    if (parsed.data.createSemester) {
      if (previousSemesters.length === 0 && previousCourses.length > 0) {
        await saveSemesterSnapshot(
          cred.id,
          "previous",
          "Previous semester",
          previousCourses.map((course) => course.courseId),
        );
      }

      const semester = currentSemester();
      await saveSemesterSnapshot(
        cred.id,
        semester.id,
        semester.name,
        courses.map((course) => course.courseId),
      );
      selectedSemesterId = semester.id;
    } else if (selectedSemesterId) {
      await updateSemesterCourses(
        cred.id,
        selectedSemesterId,
        courses.map((course) => course.courseId),
      );
    }

    const semesters = await listSemesters(cred.id);
    return NextResponse.json({
      ok: true,
      count: courses.length,
      courses,
      semesters,
      selectedSemesterId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    release();
  }
}
