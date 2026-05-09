import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { getCourse } from "@/lib/courses";
import { getSessionDiscussion, listSessionPosts, getDiskusiMeta } from "@/lib/session-diskusi";
import { listSessions } from "@/lib/sessions";
import { Badge } from "@/components/ui/badge";
import { DiskusiActions } from "./diskusi-actions";
import { DeleteDiscussionButton } from "./delete-discussion-button";

export const dynamic = "force-dynamic";

export default async function SessionDiscussionDetailPage({
  params,
}: {
  params: Promise<{ id: string; courseId: string; forumId: string; discId: string }>;
}) {
  const { id, courseId, forumId, discId } = await params;

  const [cred, course, discussion, posts, sessions, meta] = await Promise.all([
    getCredential(id),
    getCourse(id, courseId),
    getSessionDiscussion(id, courseId, forumId, discId),
    listSessionPosts(id, courseId, forumId, discId),
    listSessions(id, courseId),
    getDiskusiMeta(id, courseId, forumId, discId),
  ]);

  if (!cred || !course || !discussion) notFound();

  const forumName =
    sessions
      .flatMap((s) => s.diskusi)
      .find((d) => d.url.includes(`id=${forumId}`))?.name ?? `Diskusi ${forumId}`;

  // Student replies at depth 1 that don't have a "Me" reply under them
  const studentReplies = posts.filter((p) => p.depth === 1 && !p.isMyPost);
  const unrespondedStudents = studentReplies.filter(
    (s) => !posts.some((p) => p.isMyPost && p.parentPostId === s.postId),
  );

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
          /{" "}
          <Link
            href={`/credentials/${id}/courses/${courseId}/diskusi/${forumId}`}
            className="hover:underline"
          >
            {forumName}
          </Link>{" "}
          / Thread
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{discussion.title}</h1>
          {discussion.iReplied ? (
            <Badge variant="default">Replied</Badge>
          ) : (
            <Badge variant="destructive">Needs reply</Badge>
          )}
          <div className="ml-auto">
            <DeleteDiscussionButton
              credentialId={id}
              courseId={courseId}
              forumId={forumId}
              discId={discId}
            />
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {discussion.startedBy && <>Started by {discussion.startedBy} · </>}
          {posts.length} post{posts.length !== 1 ? "s" : ""}
          {" · "}
          <a
            href={discussion.url}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            View on UT ↗
          </a>
        </p>
      </div>

      {/* Unreplied students summary */}
      {unrespondedStudents.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive mb-1">
            {unrespondedStudents.length} student{unrespondedStudents.length > 1 ? "s" : ""} need your reply:
          </p>
          <ul className="text-sm space-y-0.5">
            {unrespondedStudents.map((s) => (
              <li key={s.postId} className="text-muted-foreground">
                · {s.author}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DiskusiActions
        credentialId={id}
        courseId={courseId}
        forumId={forumId}
        discId={discId}
        discussionUrl={discussion.url}
        posts={posts}
        initialMeta={meta}
      />
    </div>
  );
}
