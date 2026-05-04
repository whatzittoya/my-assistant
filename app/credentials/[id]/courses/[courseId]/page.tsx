import { notFound } from "next/navigation";
import Link from "next/link";
import { getCourse } from "@/lib/courses";
import { getCredential } from "@/lib/credentials";
import { listDiscussions } from "@/lib/discussions";
import { listSessions } from "@/lib/sessions";
import { CourseActions } from "./course-actions";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string; courseId: string }>;
}) {
  const { id, courseId } = await params;
  const [cred, course] = await Promise.all([getCredential(id), getCourse(id, courseId)]);
  if (!cred || !course) notFound();

  const [discussions, sessions] = await Promise.all([
    listDiscussions(id, courseId),
    listSessions(id, courseId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/credentials/${id}`} className="hover:underline">
            {cred.label}
          </Link>{" "}
          / {course.name}
        </p>
        <h1 className="text-2xl font-semibold">{course.name}</h1>
      </div>

      <CourseActions
        credentialId={id}
        courseId={courseId}
        courseUrl={course.url}
        hasForumUrl={!!course.forumPerkenalan}
        initialDiscussions={discussions}
        initialSessions={sessions}
      />
    </div>
  );
}
