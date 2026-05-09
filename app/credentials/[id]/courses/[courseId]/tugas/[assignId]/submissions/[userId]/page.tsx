import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { getCourse } from "@/lib/courses";
import { listSessions } from "@/lib/sessions";
import { getSubmission, listTugasSubmissions } from "@/lib/tugas";
import { getTugasMeta } from "@/lib/tugas-meta";
import { SubmissionDetail } from "./submission-detail";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string; courseId: string; assignId: string; userId: string }>;
}) {
  const { id, courseId, assignId, userId } = await params;

  const [cred, course, meta, submission, sessions, allSubmissions] = await Promise.all([
    getCredential(id),
    getCourse(id, courseId),
    getTugasMeta(id, courseId, assignId),
    getSubmission(id, courseId, assignId, userId),
    listSessions(id, courseId),
    listTugasSubmissions(id, courseId, assignId),
  ]);

  if (!cred || !course || !submission) notFound();

  const tugasActivity = sessions
    .flatMap((s) => s.tugas)
    .find((t) => t.url.includes(`id=${assignId}`));
  const tugasName = tugasActivity?.name ?? `Tugas ${assignId}`;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/credentials/${id}`} className="hover:underline">{cred.label}</Link>
          {" / "}
          <Link href={`/credentials/${id}/courses/${courseId}`} className="hover:underline">{course.name}</Link>
          {" / "}
          <Link href={`/credentials/${id}/courses/${courseId}/tugas/${assignId}`} className="hover:underline">{tugasName}</Link>
          {" / "}
          {submission.name}
        </p>
        <h1 className="text-2xl font-semibold">{submission.name}</h1>
      </div>

      <SubmissionDetail
        submission={submission}
        meta={meta}
        credentialId={id}
        courseId={courseId}
        assignId={assignId}
        allSubmissions={allSubmissions.map((s) => ({ userId: s.userId, name: s.name }))}
      />
    </div>
  );
}
