"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Props = {
  credentialId: string;
  courseId: string;
  discussionId: string;
  /** Pre-filled draft from a batch generate; pass undefined if not yet generated */
  initialDraft?: string;
};

export function ReplyDraft({ credentialId, courseId, discussionId, initialDraft }: Props) {
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/actions/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, discussionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setDraft(json.reply ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  const hasSkill = true; // SkillPanel on the page handles this; we just call the API

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Draft Reply
        </span>
        <Button
          size="sm"
          variant={draft ? "outline" : "default"}
          onClick={generate}
          disabled={generating}
        >
          {generating ? "Generating..." : draft ? "Regenerate" : "Generate reply"}
        </Button>
      </div>

      {draft && (
        <Textarea
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
          rows={6}
          className="text-sm bg-background"
          placeholder="Generated reply will appear here..."
        />
      )}

      {!draft && !generating && (
        <p className="text-xs text-muted-foreground">
          Click "Generate reply" to get a draft from Gemini.
        </p>
      )}
    </div>
  );
}
