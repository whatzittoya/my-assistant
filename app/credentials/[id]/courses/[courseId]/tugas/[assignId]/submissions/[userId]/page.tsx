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

  const tugasOrder = sessions
    .flatMap((s) => s.tugas)
    .map((t) => ({
      assignId: t.url.match(/[?&]id=(\d+)/)?.[1] ?? "",
      name: t.name,
    }))
    .filter((t) => t.assignId);

  const currentIdx = tugasOrder.findIndex((t) => t.assignId === assignId);
  const previousTugas = currentIdx > 0 ? tugasOrder[currentIdx - 1] : null;
  const tugasName =
    currentIdx >= 0 ? tugasOrder[currentIdx].name : `Tugas ${assignId}`;

  const previousSubmission = previousTugas
    ? await getSubmission(id, courseId, previousTugas.assignId, userId)
    : null;
  const previousFeedback =
    previousSubmission?.finalEval?.feedback?.trim()
      ? {
          tugasName: previousTugas!.name,
          assignId: previousTugas!.assignId,
          feedback: previousSubmission.finalEval.feedback,
          savedAt: previousSubmission.finalEval.savedAt,
        }
      : null;

  return (
    <div className="space-y-4 relative left-1/2 w-[min(calc(100vw-18rem-4rem),1400px)] -translate-x-1/2">
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
        key={`${assignId}-${userId}`}
        submission={submission}
        meta={meta}
        credentialId={id}
        courseId={courseId}
        assignId={assignId}
        allSubmissions={allSubmissions.map((s) => ({ userId: s.userId, name: s.name }))}
        previousFeedback={previousFeedback}
      />
    </div>
  );
}
