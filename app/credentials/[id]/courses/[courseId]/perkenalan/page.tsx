import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { getCourse } from "@/lib/courses";
import { listDiscussionsWithPosts } from "@/lib/discussions";
import { PerkenalanActions } from "./perkenalan-actions";

export const dynamic = "force-dynamic";

export default async function PerkenalanPage({
  params,
}: {
  params: Promise<{ id: string; courseId: string }>;
}) {
  const { id, courseId } = await params;

  const [cred, course] = await Promise.all([getCredential(id), getCourse(id, courseId)]);
  if (!cred || !course) notFound();

  const threads = await listDiscussionsWithPosts(id, courseId);

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
          / Forum Perkenalan
        </p>
        <h1 className="text-2xl font-semibold">Forum Perkenalan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every student opens their own thread. Export them as one JSON batch, paste the
          AI result back, then send all replies to UT.
          {course.forumPerkenalan && (
            <>
              {" · "}
              <a
                href={course.forumPerkenalan}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                View forum on UT ↗
              </a>
            </>
          )}
        </p>
      </div>

      <PerkenalanActions
        credentialId={id}
        courseId={courseId}
        courseName={course.name}
        initialThreads={threads}
      />
    </div>
  );
}
