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
