import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { listCourses } from "@/lib/courses";
import { countNeedsReply } from "@/lib/discussions";
import { Badge } from "@/components/ui/badge";
import { CredentialActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function CredentialDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cred = await getCredential(id);
  if (!cred) notFound();
  const [courses, needsReplyCount] = await Promise.all([
    listCourses(id),
    countNeedsReply(id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cred.label}</h1>
          {needsReplyCount > 0 && (
            <Link href={`/credentials/${id}/needs-reply`}>
              <Badge variant="destructive" className="cursor-pointer hover:opacity-80">
                {needsReplyCount} need reply
              </Badge>
            </Link>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{cred.username}</p>
      </div>
      <CredentialActions credentialId={cred.id} initialCourses={courses} />
    </div>
  );
}
