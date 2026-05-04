import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { getCourse } from "@/lib/courses";
import { getDiscussion, listPosts } from "@/lib/discussions";
import { Badge } from "@/components/ui/badge";
import { SkillPanel } from "@/components/skill-panel";
import { ReplyDraft } from "@/components/reply-draft";
import { PostThread } from "@/components/post-thread";

export const dynamic = "force-dynamic";

export default async function DiscussionDetailPage({
  params,
}: {
  params: Promise<{ id: string; courseId: string; discId: string }>;
}) {
  const { id, courseId, discId } = await params;

  const [cred, course, discussion, posts] = await Promise.all([
    getCredential(id),
    getCourse(id, courseId),
    getDiscussion(id, courseId, discId),
    listPosts(id, courseId, discId),
  ]);

  if (!cred || !course || !discussion) notFound();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/credentials/${id}`} className="hover:underline">
            {cred.label}
          </Link>{" "}
          /{" "}
          <Link href={`/credentials/${id}/courses/${courseId}`} className="hover:underline">
            {course.name}
          </Link>{" "}
          / Discussion
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{discussion.title}</h1>
          {discussion.iReplied ? (
            <Badge variant="default">Replied</Badge>
          ) : (
            <Badge variant="destructive">Needs reply</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Started by {discussion.startedBy} · {posts.length} post
          {posts.length !== 1 ? "s" : ""}
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

      <SkillPanel skillId="forum-perkenalan" />

      <PostThread posts={posts} />


      {/* Draft reply */}
      {!discussion.iReplied && (
        <ReplyDraft
          credentialId={id}
          courseId={courseId}
          discussionId={discId}
        />
      )}
    </div>
  );
}
