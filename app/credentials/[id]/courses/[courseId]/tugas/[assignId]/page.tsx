import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { getCourse } from "@/lib/courses";
import { listSessions } from "@/lib/sessions";
import { listTugasSubmissions } from "@/lib/tugas";
import { getTugasMeta } from "@/lib/tugas-meta";
import { TugasActions } from "./tugas-actions";

export const dynamic = "force-dynamic";

export default async function TugasPage({
  params,
}: {
  params: Promise<{ id: string; courseId: string; assignId: string }>;
}) {
  const { id, courseId, assignId } = await params;

  const [cred, course] = await Promise.all([getCredential(id), getCourse(id, courseId)]);
  if (!cred || !course) notFound();

  const [sessions, submissions, meta] = await Promise.all([
    listSessions(id, courseId),
    listTugasSubmissions(id, courseId, assignId),
    getTugasMeta(id, courseId, assignId),
  ]);

  // Resolve tugas name from session activities
  const tugasActivity = sessions
    .flatMap((s) => s.tugas)
    .find((t) => t.url.includes(`id=${assignId}`));
  const tugasName = tugasActivity?.name ?? `Tugas ${assignId}`;
  const tugasUrl = tugasActivity?.url ?? `https://elearning.ut.ac.id/mod/assign/view.php?id=${assignId}`;

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
          / {tugasName}
        </p>
        <h1 className="text-2xl font-semibold">{tugasName}</h1>
      </div>

      <TugasActions
        credentialId={id}
        courseId={courseId}
        assignId={assignId}
        tugasUrl={tugasUrl}
        initialSubmissions={submissions}
        initialMeta={meta}
      />
    </div>
  );
}
