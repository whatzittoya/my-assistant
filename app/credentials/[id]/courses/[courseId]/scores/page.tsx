import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { getCourse } from "@/lib/courses";
import { buildScoreMonitor } from "@/lib/gradebook";
import { ScoreMonitorClient } from "./score-monitor-client";

export const dynamic = "force-dynamic";

export default async function ScoresPage({
  params,
}: {
  params: Promise<{ id: string; courseId: string }>;
}) {
  const { id, courseId } = await params;
  const [cred, course, monitor] = await Promise.all([
    getCredential(id),
    getCourse(id, courseId),
    buildScoreMonitor(id, courseId),
  ]);

  if (!cred || !course) notFound();

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
          / Score monitor
        </p>
        <h1 className="text-2xl font-semibold">Score monitor</h1>
      </div>

      <ScoreMonitorClient
        credentialId={id}
        courseId={courseId}
        initialMonitor={monitor}
      />
    </div>
  );
}
