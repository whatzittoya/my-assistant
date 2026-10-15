import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { getCourse } from "@/lib/courses";
import { listSessionDiscussionsWithStatus } from "@/lib/session-diskusi";
import { listSessions } from "@/lib/sessions";
import { listRubrikFiles } from "@/lib/rubrik-diskusi";
import { RubrikCard } from "@/components/rubrik-card";
import { DiskusiActions } from "./diskusi-actions";

export const dynamic = "force-dynamic";

export default async function DiskusiForumPage({
  params,
}: {
  params: Promise<{ id: string; courseId: string; forumId: string }>;
}) {
  const { id, courseId, forumId } = await params;

  const [cred, course, discussions, sessions, rubrikFiles] = await Promise.all([
    getCredential(id),
    getCourse(id, courseId),
    listSessionDiscussionsWithStatus(id, courseId, forumId),
    listSessions(id, courseId),
    listRubrikFiles(id, courseId, forumId),
  ]);

  if (!cred || !course) notFound();

  // Find the diskusi name from sessions data
  const forumName =
    sessions
      .flatMap((s) => s.diskusi)
      .find((d) => d.url.includes(`id=${forumId}`))?.name ?? `Diskusi ${forumId}`;

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
          / {forumName}
        </p>
        <h1 className="text-2xl font-semibold">{forumName}</h1>
      </div>

      <RubrikCard
        credentialId={id}
        courseId={courseId}
        forumId={forumId}
        initialFiles={rubrikFiles}
      />

      <DiskusiActions
        credentialId={id}
        courseId={courseId}
        forumId={forumId}
        forumName={forumName}
        initialDiscussions={discussions}
      />
    </div>
  );
}
