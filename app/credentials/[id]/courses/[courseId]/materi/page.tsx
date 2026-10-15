import { notFound } from "next/navigation";
import Link from "next/link";
import * as path from "path";
import { getCredential } from "@/lib/credentials";
import { getCourse } from "@/lib/courses";
import { listSemesters } from "@/lib/semesters";
import { courseDir, readCollectedSessions } from "@/lib/materi";
import { MateriView } from "./materi-view";

export const dynamic = "force-dynamic";

export default async function MateriPage({
  params,
}: {
  params: Promise<{ id: string; courseId: string }>;
}) {
  const { id, courseId } = await params;

  const [cred, course, semesters] = await Promise.all([
    getCredential(id),
    getCourse(id, courseId),
    listSemesters(id),
  ]);
  if (!cred || !course) notFound();

  const semesterName =
    semesters.find((s) => s.courseIds.includes(courseId))?.name ?? "Tanpa Semester";
  const dir = courseDir(semesterName, course.name);
  const sessions = readCollectedSessions(dir);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/credentials/${id}`} className="hover:underline">
            {cred.label}
          </Link>{" "}
          /{" "}
          <Link href={`/credentials/${id}/courses/${courseId}`} className="hover:underline">
            {course.name}
          </Link>{" "}
          / Materi
        </p>
        <h1 className="text-2xl font-semibold">Materi — {course.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sessions.length} sesi ·{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs select-all">
            {path.relative(process.cwd(), dir)}
          </code>
          {course.materiCollectedAt && (
            <> · dikumpulkan {new Date(course.materiCollectedAt).toLocaleString()}</>
          )}
        </p>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada materi. Jalankan &ldquo;Deep collect material&rdquo; di halaman mata kuliah
          terlebih dahulu.
        </p>
      ) : (
        <MateriView sessions={sessions} />
      )}
    </div>
  );
}
