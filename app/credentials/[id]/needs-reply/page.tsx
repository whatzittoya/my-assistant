import { notFound } from "next/navigation";
import Link from "next/link";
import { getCredential } from "@/lib/credentials";
import { listNeedsReply } from "@/lib/discussions";
import { Badge } from "@/components/ui/badge";
import { SkillPanel } from "@/components/skill-panel";
import { NeedsReplyClient } from "./needs-reply-client";

export const dynamic = "force-dynamic";

export default async function NeedsReplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cred = await getCredential(id);
  if (!cred) notFound();

  const groups = await listNeedsReply(id);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/credentials/${id}`} className="hover:underline">
            {cred.label}
          </Link>{" "}
          / Needs reply
        </p>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Needs Reply</h1>
          <Badge variant="destructive">{groups.length}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Discussions where you have not replied yet, sorted by latest activity.
        </p>
      </div>

      <SkillPanel skillId="forum-perkenalan" />

      <NeedsReplyClient credentialId={id} initialGroups={groups} />
    </div>
  );
}
