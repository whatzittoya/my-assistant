"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  credentialId: string;
  courseId: string;
  forumId: string;
  discId: string;
};

export function DeleteDiscussionButton({ credentialId, courseId, forumId, discId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (
      !confirm(
        "Delete this discussion and all its collected posts from the database? The forum on UT is not affected. You can re-scrape after.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const qs = new URLSearchParams({ credentialId, courseId });
      const res = await fetch(
        `/api/session-diskusi/${forumId}/${discId}?${qs.toString()}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Discussion deleted");
      router.push(`/credentials/${credentialId}/courses/${courseId}/diskusi/${forumId}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setDeleting(false);
    }
  }

  return (
    <Button size="sm" variant="destructive" onClick={onDelete} disabled={deleting}>
      {deleting ? "Deleting..." : "Delete (re-scrape)"}
    </Button>
  );
}
