"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Post } from "@/types";
import type { NeedsReplyGroup } from "@/lib/discussions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  // Client-side: use DOM parser for accurate stripping
  if (typeof document !== "undefined") {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent ?? tmp.innerText ?? "";
  }
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildThread(posts: Post[]): Post[] {
  const byParent = new Map<string | null, Post[]>();
  for (const p of posts) {
    const key = p.parentPostId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(p);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => (a.datetimeIso ?? "").localeCompare(b.datetimeIso ?? ""));
  }
  function walk(parentId: string | null): Post[] {
    return (byParent.get(parentId) ?? []).flatMap((c) => [c, ...walk(c.postId)]);
  }
  return walk(null);
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({ post, isRoot }: { post: Post; isRoot: boolean }) {
  const date = post.datetimeIso
    ? new Date(post.datetimeIso).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        post.isMyPost
          ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
          : "bg-card"
      }`}
      style={{ marginLeft: isRoot ? 0 : `${Math.min(post.depth, 5) * 1.25}rem` }}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="font-semibold">{post.author}</span>
        {post.isMyPost && <Badge variant="default" className="text-xs">Me</Badge>}
        {isRoot && <Badge variant="outline" className="text-xs">OP</Badge>}
        {date && <span className="text-muted-foreground text-xs">{date}</span>}
      </div>
      <div
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />
    </div>
  );
}

// ── Inline reply draft per discussion ─────────────────────────────────────────

function InlineReplyDraft({
  credentialId,
  courseId,
  discussionId,
  draft,
  onDraftChange,
}: {
  credentialId: string;
  courseId: string;
  discussionId: string;
  draft: string;
  onDraftChange: (text: string) => void;
}) {
  const [generating, setGenerating] = useState(false);

  async function regenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/actions/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, discussionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      onDraftChange(json.reply ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to regenerate");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Draft Reply
        </span>
        <Button size="sm" variant="outline" onClick={regenerate} disabled={generating}>
          {generating ? "Generating..." : "Regenerate"}
        </Button>
      </div>
      <Textarea
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onDraftChange(e.target.value)}
        rows={5}
        className="text-sm bg-background"
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type GeneratedReply = { discussionId: string; courseId: string; reply: string };
type SendStatus = "idle" | "sending" | "done" | "error";

export function NeedsReplyClient({
  credentialId,
  initialGroups,
}: {
  credentialId: string;
  initialGroups: NeedsReplyGroup[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [sendStatus, setSendStatus] = useState<Record<string, SendStatus>>({});
  const [sending, setSending] = useState(false);
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(6);

  function setDraft(discussionId: string, text: string) {
    setDrafts((prev) => ({ ...prev, [discussionId]: text }));
  }

  async function generateAll() {
    setGeneratingAll(true);
    try {
      const res = await fetch("/api/actions/generate-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const replies: GeneratedReply[] = json.replies ?? [];
      const map: Record<string, string> = {};
      for (const r of replies) map[r.discussionId] = r.reply;
      setDrafts(map);
      // Reset send statuses for newly generated
      setSendStatus({});
      toast.success(`Generated ${replies.length} replies`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGeneratingAll(false);
    }
  }

  async function sendAll() {
    // Build items from drafts that have content
    const items = initialGroups
      .filter((g) => drafts[g.discussion.id]?.trim())
      .map((g) => ({
        discussionId: g.discussion.id,
        courseId: g.courseId,
        discussionUrl: g.discussion.url,
        reply: drafts[g.discussion.id],
      }));

    if (items.length === 0) {
      toast.error("No drafts to send");
      return;
    }

    setSending(true);
    // Mark all as sending
    const initialStatus: Record<string, SendStatus> = {};
    for (const item of items) initialStatus[item.discussionId] = "sending";
    setSendStatus(initialStatus);

    try {
      const res = await fetch("/api/actions/post-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, items, delayMin, delayMax }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const results: Array<{ discussionId: string; status: "ok" | "error"; error?: string }> =
        json.results ?? [];

      const newStatus: Record<string, SendStatus> = {};
      for (const r of results) {
        newStatus[r.discussionId] = r.status === "ok" ? "done" : "error";
      }
      setSendStatus(newStatus);

      const ok = results.filter((r) => r.status === "ok").length;
      const failed = results.filter((r) => r.status === "error").length;
      if (failed > 0) {
        toast.error(`${ok} sent, ${failed} failed — check activity log`);
      } else {
        toast.success(`${ok} replies posted to UT`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setSendStatus({});
    } finally {
      setSending(false);
    }
  }

  const draftCount = Object.values(drafts).filter((d) => d?.trim()).length;
  const doneCount = Object.values(sendStatus).filter((s) => s === "done").length;

  if (initialGroups.length === 0) {
    return (
      <p className="text-muted-foreground">All caught up — no discussions need a reply.</p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        {/* Generate */}
        <Button onClick={generateAll} disabled={generatingAll || sending} variant="outline">
          {generatingAll
            ? `Generating ${initialGroups.length} replies...`
            : `Generate all ${initialGroups.length} replies`}
        </Button>

        {draftCount > 0 && !sending && doneCount === 0 && (
          <>
            {/* Delay config */}
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Delay</span>
              <Input
                type="number"
                min={1}
                max={60}
                value={delayMin}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDelayMin(Number(e.target.value))
                }
                className="w-16 h-8 text-center"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                min={1}
                max={60}
                value={delayMax}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDelayMax(Number(e.target.value))
                }
                className="w-16 h-8 text-center"
              />
              <span className="text-muted-foreground">sec</span>
            </div>

            {/* Send button */}
            <Button onClick={sendAll} disabled={sending}>
              Send {draftCount} {draftCount === 1 ? "reply" : "replies"} to UT
            </Button>
          </>
        )}

        {sending && (
          <span className="text-sm text-muted-foreground">
            Posting... watch Activity log for progress
          </span>
        )}

        {doneCount > 0 && !sending && (
          <span className="text-sm text-green-600 dark:text-green-400">
            {doneCount} replied
          </span>
        )}
      </div>

      {/* Discussions */}
      {initialGroups.map(({ courseId, courseName, discussion, posts }) => {
        const threaded = buildThread(posts);
        const rootPostIds = new Set(posts.filter((p) => p.depth === 0).map((p) => p.postId));
        const draft = drafts[discussion.id];
        const status = sendStatus[discussion.id];

        return (
          <div key={discussion.id} className="space-y-3">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  <Link
                    href={`/credentials/${credentialId}/courses/${courseId}`}
                    className="hover:underline"
                  >
                    {courseName}
                  </Link>
                </p>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/credentials/${credentialId}/courses/${courseId}/discussions/${discussion.id}`}
                    className="font-semibold hover:underline"
                  >
                    {discussion.title}
                  </Link>
                  <a
                    href={discussion.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    ↗
                  </a>
                  {status === "sending" && (
                    <Badge variant="secondary" className="text-xs">Posting...</Badge>
                  )}
                  {status === "done" && (
                    <Badge variant="default" className="text-xs">Posted</Badge>
                  )}
                  {status === "error" && (
                    <Badge variant="destructive" className="text-xs">Failed</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Started by {discussion.startedBy} · {posts.length} post
                  {posts.length !== 1 ? "s" : ""}
                  {discussion.lastPostDate && (
                    <> · Last activity {new Date(discussion.lastPostDate).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            </div>

            {/* Thread */}
            {threaded.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts collected.</p>
            ) : (
              <div className="space-y-2">
                {threaded.map((post) => (
                  <PostCard
                    key={post.postId}
                    post={post}
                    isRoot={rootPostIds.has(post.postId)}
                  />
                ))}
              </div>
            )}

            {/* Draft reply — shown when generated, hidden after successful send */}
            {draft !== undefined && status !== "done" && (
              <InlineReplyDraft
                credentialId={credentialId}
                courseId={courseId}
                discussionId={discussion.id}
                draft={draft}
                onDraftChange={(text) => setDraft(discussion.id, text)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
