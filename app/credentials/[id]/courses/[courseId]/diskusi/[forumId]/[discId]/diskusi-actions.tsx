"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PostThread } from "@/components/post-thread";
import { SkillManager } from "@/components/skill-manager";
import type { Post } from "@/types";
import type { Skill } from "@/lib/skills";

// ── Types ─────────────────────────────────────────────────────────────────────

type GenerateResult = {
  postId: string;
  author: string;
  score: number;
  draft: string;
  replies: string[];
  aiScore?: number;            // AI-detected writing quality score
  duplicateConfidence?: number; // 0-100, how likely copy-paste
  duplicateOf?: string | null;  // postId of the likely source
};

type PostStatus = "idle" | "posting" | "done" | "error";

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

const EM_DASH_RE = /\u2014/g;

function hasEmDash(text: string): boolean {
  return EM_DASH_RE.test(text);
}

function sanitizeDraft(text: string): string {
  return text.replace(/\s*\u2014\s*/g, ", ");
}

function scoreColor(score: number) {
  if (score >= 80) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 60) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

// ── Inline draft card (shown below each unreplied student post) ───────────────

function InlineDraftCard({
  result,
  post,
  posts,
  status,
  regenerating,
  credentialId,
  courseId,
  forumId,
  discId,
  discussionUrl,
  delayMin,
  delayMax,
  skillId,
  onDraftChange,
  onScoreChange,
  onDone,
  onRegenerate,
}: {
  result: GenerateResult;
  post: Post | undefined;
  posts: Post[];
  status: PostStatus;
  regenerating: boolean;
  credentialId: string;
  courseId: string;
  forumId: string;
  discId: string;
  discussionUrl: string;
  delayMin: number;
  delayMax: number;
  skillId: string;
  onDraftChange: (draft: string) => void;
  onScoreChange: (score: number) => void;
  onDone: () => void;
  onRegenerate: () => void;
}) {
  async function postReply() {
    try {
      const res = await fetch("/api/actions/post-diskusi-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId, courseId, forumId, discId, discussionUrl,
          items: [{ postId: result.postId, reply: sanitizeDraft(result.draft), score: result.score }],
          delayMin, delayMax,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      if (json.results?.[0]?.status === "error") throw new Error(json.results[0].error ?? "Failed");
      onDone();
      toast.success(`Replied to ${result.author}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className={`mt-3 rounded-lg border bg-muted/20 p-3 space-y-2 ${status === "done" ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Draft reply for {result.author}</span>
        {result.aiScore !== undefined && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            result.aiScore >= 70
              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
              : "bg-muted text-muted-foreground"
          }`}>
            AI {result.aiScore}%
          </span>
        )}
        {result.duplicateConfidence !== undefined && result.duplicateConfidence > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            result.duplicateConfidence >= 70
              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
          }`}>
            Copy {result.duplicateConfidence}%
            {result.duplicateOf ? ` of ${posts.find((x) => x.postId === result.duplicateOf)?.author ?? result.duplicateOf.slice(-6)}` : ""}
          </span>
        )}
        <div className="flex items-center gap-1">
          <Input
            type="number" min={0} max={100}
            value={result.score}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onScoreChange(Number(e.target.value))}
            className={`w-16 h-6 text-center text-xs font-semibold rounded-full border-0 ${scoreColor(result.score)}`}
            disabled={status === "done"}
          />
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
        {status === "posting" && <Badge variant="secondary" className="text-xs">Posting...</Badge>}
        {status === "done" && <Badge variant="default" className="text-xs">Posted</Badge>}
        {status === "error" && <Badge variant="destructive" className="text-xs">Failed</Badge>}
      </div>
      {hasEmDash(result.draft) && (
        <p className="text-xs text-orange-600 dark:text-orange-400">
          ⚠ Em dash (—) found — will be replaced with " - " on post.
        </p>
      )}
      <Textarea
        value={result.draft}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onDraftChange(e.target.value)}
        rows={3}
        className="text-sm"
        disabled={status === "done"}
      />
      {status !== "done" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={postReply} disabled={status === "posting" || !result.draft.trim()}>
            {status === "posting" ? "Posting..." : "Post"}
          </Button>
          <Button size="sm" variant="outline" onClick={onRegenerate} disabled={regenerating || status === "posting"}>
            {regenerating ? "..." : "Regenerate"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Replied student card (read-only, collapsed) ───────────────────────────────

function RepliedStudentCard({ post, myReply, noScore }: { post: Post; myReply: Post; noScore?: boolean }) {
  const [open, setOpen] = useState(false);
  const date = post.datetimeIso
    ? new Date(post.datetimeIso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "";
  return (
    <div className={`rounded-lg border p-3 text-sm ${noScore ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20" : "bg-muted/30 opacity-70"}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{post.author}</span>
        <Badge variant="default" className="text-xs">Replied</Badge>
        {noScore ? (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            No score
          </span>
        ) : post.rating !== null && (
          <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${scoreColor(post.rating!)}`}>
            {post.rating}{post.ratingCount ? ` (${post.ratingCount})` : ""}
          </span>
        )}
        {date && <span className="text-xs text-muted-foreground">{date}</span>}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          {open ? "Hide" : "Show reply"}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="prose prose-sm dark:prose-invert max-w-none border-l-2 pl-3 text-muted-foreground" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
          <div className="rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">My reply:</p>
            <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: myReply.contentHtml }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export / Upload dialog ────────────────────────────────────────────────────

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildInstruction(promptPost: Post | undefined, discussionTitle: string) {
  return `You are an assistant helping a university lecturer evaluate and reply to student discussion posts.

Context:
- Discussion title: "${discussionTitle}"
- The lecturer's question (prompt): "${promptPost ? stripHtml(promptPost.contentHtml) : ""}"

For each student post you receive, you must produce:
1. score (0–100): Grade the answer based on relevance, depth, and clarity.
2. reply: A short, personal, encouraging lecturer reply in Bahasa Indonesia (2–4 sentences max).
3. ai_score (0–100): Likelihood that the text was AI-generated (100 = almost certainly AI, 0 = clearly human).
4. duplicate_confidence (0–100): Likelihood that this post was copied/plagiarised from another student in this batch (100 = definite copy, 0 = original).
5. duplicate_of: The postId of the most likely source if duplicate_confidence > 50, otherwise null.

Return ONLY a valid JSON object — no markdown, no extra text:
{
  "results": [
    {
      "postId": "<same postId from input>",
      "name": "<student name>",
      "score": <integer 0-100>,
      "reply": "<lecturer reply in Bahasa Indonesia>",
      "ai_score": <integer 0-100>,
      "duplicate_confidence": <integer 0-100>,
      "duplicate_of": "<postId or null>"
    }
  ]
}`;
}

function buildDiscussionJson(selectedPosts: Post[]) {
  return JSON.stringify(
    {
      students: selectedPosts.map((p) => ({
        postId: p.postId,
        author: p.author,
        datetime: p.datetimeIso,
        content: stripHtml(p.contentHtml),
      })),
    },
    null,
    2,
  );
}

type AiResult = {
  postId: string;
  name?: string;
  score: number;
  reply: string;
  ai_score?: number;
  duplicate_confidence?: number;
  duplicate_of?: string | null;
};

function ExportDialog({
  open,
  onClose,
  selectedPosts,
  promptPost,
  discussionTitle,
  onLoadDrafts,
}: {
  open: boolean;
  onClose: () => void;
  selectedPosts: Post[];
  promptPost: Post | undefined;
  discussionTitle: string;
  onLoadDrafts: (results: AiResult[]) => void;
}) {
  const [tab, setTab] = useState<"instruction" | "discussion" | "upload">("instruction");
  const [uploadText, setUploadText] = useState("");
  const [parseError, setParseError] = useState("");
  const [parsed, setParsed] = useState<AiResult[]>([]);

  const instruction = buildInstruction(promptPost, discussionTitle);
  const discussionJson = buildDiscussionJson(selectedPosts);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
  }

  function parseUpload(text: string) {
    setUploadText(text);
    setParseError("");
    setParsed([]);
    if (!text.trim()) return;
    try {
      const raw = JSON.parse(text);
      const results: AiResult[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.results)
          ? raw.results
          : [];
      if (results.length === 0) { setParseError("No results array found."); return; }
      const valid = results.filter(
        (r) => typeof r.postId === "string" && typeof r.score === "number" && typeof r.reply === "string",
      );
      if (valid.length === 0) { setParseError("Items missing postId / score / reply fields."); return; }
      setParsed(valid);
    } catch (e) {
      setParseError(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function loadDrafts() {
    onLoadDrafts(parsed);
    setUploadText("");
    setParsed([]);
    onClose();
    toast.success(`Loaded ${parsed.length} draft${parsed.length !== 1 ? "s" : ""}`);
  }

  const tabs = [
    { id: "instruction" as const, label: "Instruction" },
    { id: "discussion" as const, label: `Discussion JSON (${selectedPosts.length})` },
    { id: "upload" as const, label: "Upload AI Result" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export for AI / Import Result</DialogTitle>
        </DialogHeader>

        <div className="flex gap-0 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto space-y-3 pt-3">
          {tab === "instruction" && (
            <>
              <p className="text-xs text-muted-foreground">
                Send this first to the AI to set context. Then send the Discussion JSON separately.
              </p>
              <Button size="sm" variant="outline" onClick={() => copy(instruction)}>
                Copy instruction
              </Button>
              <textarea
                readOnly
                value={instruction}
                className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none"
              />
            </>
          )}

          {tab === "discussion" && (
            <>
              <p className="text-xs text-muted-foreground">
                After the instruction, paste this JSON to the AI. It will return scored replies.
              </p>
              <Button size="sm" variant="outline" onClick={() => copy(discussionJson)}>
                Copy JSON
              </Button>
              <textarea
                readOnly
                value={discussionJson}
                className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none"
              />
            </>
          )}

          {tab === "upload" && (
            <>
              <p className="text-xs text-muted-foreground">
                Paste the AI's JSON response. Preview, then load as drafts.
              </p>
              <Textarea
                value={uploadText}
                onChange={(e) => parseUpload(e.target.value)}
                rows={8}
                className="text-xs font-mono"
                placeholder={'{"results":[{"postId":"...","score":80,"reply":"..."}]}'}
              />
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
              {parsed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">{parsed.length} parsed:</p>
                  <div className="space-y-1 max-h-56 overflow-auto">
                    {parsed.map((r) => (
                      <div key={r.postId} className="rounded border p-2 text-xs space-y-1">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="font-semibold">{r.name ?? r.postId}</span>
                          {/* Grade score */}
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreColor(r.score)}`}>
                            Score {r.score}
                          </span>
                          {/* AI detection */}
                          {r.ai_score !== undefined && (
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${
                              r.ai_score >= 70
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              AI {r.ai_score}%
                            </span>
                          )}
                          {/* Duplicate */}
                          {r.duplicate_confidence !== undefined && r.duplicate_confidence > 0 && (
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${
                              r.duplicate_confidence >= 70
                                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                            }`}>
                              Copy {r.duplicate_confidence}%
                              {r.duplicate_of ? ` of ${parsed.find((x) => x.postId === r.duplicate_of)?.name ?? r.duplicate_of.slice(-6)}` : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground line-clamp-2">{r.reply}</p>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" onClick={loadDrafts}>
                    Load {parsed.length} as drafts
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiskusiActions({
  credentialId,
  courseId,
  forumId,
  discId,
  discussionUrl,
  posts,
}: {
  credentialId: string;
  courseId: string;
  forumId: string;
  discId: string;
  discussionUrl: string;
  posts: Post[];
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillId, setSkillId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingOne, setGeneratingOne] = useState<string | null>(null);
  // draft + score lifted into results for "Post all" access
  const [results, setResults] = useState<GenerateResult[]>([]);
  const [postStatuses, setPostStatuses] = useState<Map<string, PostStatus>>(new Map());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(6);
  const [postingAll, setPostingAll] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [highlightPostId, setHighlightPostId] = useState<string | undefined>();

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data) => {
        const list: Skill[] = data.items ?? [];
        setSkills(list);
        if (list.length > 0) setSkillId(list[0].id);
      })
      .catch(() => {});
  }, []);

  // All non-me posts at any depth > 0 (initial replies + follow-ups after my response)
  const allStudentPosts = posts.filter((p) => p.depth > 0 && !p.isMyPost);

  function myReplyFor(studentPostId: string): Post | undefined {
    const children = posts.filter((p) => p.parentPostId === studentPostId);
    return children.find((p) => p.isMyPost) ?? children[0];
  }

  const repliedStudents = allStudentPosts.filter((p) => !!myReplyFor(p.postId));
  const repliedNotScored = repliedStudents.filter((p) => p.rating === null);
  const unrepliedStudents = allStudentPosts.filter((p) => !myReplyFor(p.postId));
  const allUnscored = allStudentPosts.filter((p) => p.rating === null);

  function focusPost(postId: string) {
    setHighlightPostId(postId);
    const el = document.getElementById(`post-${postId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightPostId(undefined), 2000);
  }
  const activeUnreplied = unrepliedStudents.filter((p) => !skipped.has(p.postId));

  const [replyCount, setReplyCount] = useState(0);
  const effectiveCount =
    replyCount === 0 || replyCount > activeUnreplied.length
      ? activeUnreplied.length
      : replyCount;

  function setStatus(postId: string, status: PostStatus) {
    setPostStatuses((prev) => new Map(prev).set(postId, status));
  }

  function updateDraft(postId: string, draft: string) {
    setResults((prev) => prev.map((r) => r.postId === postId ? { ...r, draft } : r));
  }

  function updateScore(postId: string, score: number) {
    setResults((prev) => prev.map((r) => r.postId === postId ? { ...r, score } : r));
  }

  function updateResult(updated: GenerateResult) {
    setResults((prev) => prev.map((r) => r.postId === updated.postId ? updated : r));
  }

  function toggleSkip(postId: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function selectAll() { setSkipped(new Set()); }
  function unselectAll() { setSkipped(new Set(unrepliedStudents.map((p) => p.postId))); }

  function loadAiDrafts(aiResults: AiResult[]) {
    for (const r of aiResults) {
      const match = unrepliedStudents.find((p) => p.postId === r.postId);
      if (!match) continue;
      setResults((prev) => {
        const without = prev.filter((x) => x.postId !== r.postId);
        return [
          ...without,
          {
            postId: r.postId,
            author: r.name ?? match.author,
            score: r.score,
            draft: sanitizeDraft(r.reply),
            replies: [sanitizeDraft(r.reply)],
            aiScore: r.ai_score,
            duplicateConfidence: r.duplicate_confidence,
            duplicateOf: r.duplicate_of,
          },
        ];
      });
      setStatus(r.postId, "idle");
    }
  }

  function toResult(r: { postId: string; author: string; score: number; replies: string[] }): GenerateResult {
    return { ...r, draft: r.replies[0] ?? "" };
  }

  async function generate() {
    if (!skillId) { toast.error("Select a skill first"); return; }
    const targetIds = activeUnreplied.slice(0, effectiveCount).map((p) => p.postId);
    if (targetIds.length === 0) { toast.info("Nothing to generate"); return; }
    setGenerating(true);
    setResults([]);
    setPostStatuses(new Map());
    try {
      const res = await fetch("/api/actions/generate-diskusi-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, forumId, discId, skillId, postIds: targetIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const r = (json.results ?? []) as { postId: string; author: string; score: number; replies: string[] }[];
      if (r.length === 0) toast.info("No replies generated");
      else { setResults(r.map(toResult)); toast.success(`Evaluated ${r.length} student${r.length !== 1 ? "s" : ""}`); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  async function generateOne(post: Post) {
    if (!skillId) { toast.error("Select a skill first"); return; }
    setGeneratingOne(post.postId);
    try {
      const res = await fetch("/api/actions/generate-diskusi-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, forumId, discId, skillId, postIds: [post.postId] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const r = (json.results ?? []) as { postId: string; author: string; score: number; replies: string[] }[];
      if (r.length === 0) { toast.info("No reply generated"); return; }
      const incoming = toResult(r[0]);
      setResults((prev) => {
        const without = prev.filter((x) => x.postId !== post.postId);
        return [...without, incoming];
      });
      setStatus(post.postId, "idle");
      toast.success(`Generated reply for ${post.author}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setGeneratingOne(null);
    }
  }

  function manualReply(post: Post) {
    setResults((prev) => {
      if (prev.some((x) => x.postId === post.postId)) return prev;
      return [...prev, { postId: post.postId, author: post.author, score: 0, draft: "", replies: [] }];
    });
    setStatus(post.postId, "idle");
  }

  async function postAll() {
    const pending = results.filter((r) => (postStatuses.get(r.postId) ?? "idle") !== "done" && r.draft.trim());
    if (pending.length === 0) { toast.info("No pending drafts"); return; }
    setPostingAll(true);
    try {
      const res = await fetch("/api/actions/post-diskusi-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId, courseId, forumId, discId, discussionUrl,
          items: pending.map((r) => ({ postId: r.postId, reply: sanitizeDraft(r.draft), score: r.score })),
          delayMin, delayMax,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      for (const item of json.results ?? []) {
        setStatus(item.postId, item.status === "error" ? "error" : "done");
      }
      const ok = (json.results ?? []).filter((x: { status: string }) => x.status !== "error").length;
      toast.success(`Posted ${ok} of ${pending.length} replies`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPostingAll(false);
    }
  }

  if (allStudentPosts.length === 0) return null;

  const pendingCount = results.filter((r) => (postStatuses.get(r.postId) ?? "idle") !== "done").length;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-semibold">AI Evaluation & Reply</h2>
          <Badge variant={unrepliedStudents.length > 0 ? "destructive" : "default"}>
            {unrepliedStudents.length} unreplied
          </Badge>
          {repliedNotScored.length > 0 && (
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
              {repliedNotScored.length} not scored
            </Badge>
          )}
          {repliedStudents.length > 0 && (
            <Badge variant="secondary">{repliedStudents.length} replied</Badge>
          )}
          {/* Post all — appears once drafts exist */}
          {pendingCount > 0 && (
            <Button
              size="sm"
              onClick={postAll}
              disabled={postingAll || generating}
              className="ml-auto"
            >
              {postingAll ? "Posting all..." : `Post all (${pendingCount})`}
            </Button>
          )}
        </div>

        <SkillManager skills={skills} selectedId={skillId} onSelect={setSkillId} onSkillsChange={setSkills} />

        {unrepliedStudents.length > 0 && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Reply to (students)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={unrepliedStudents.length}
                  value={replyCount === 0 ? unrepliedStudents.length : replyCount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const v = Math.max(1, Math.min(unrepliedStudents.length, Number(e.target.value)));
                    setReplyCount(v);
                  }}
                  className="w-20 h-8 text-center"
                />
                <span className="text-sm text-muted-foreground">of {unrepliedStudents.length}</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Delay (sec)</label>
              <div className="flex items-center gap-1.5">
                <Input type="number" min={1} max={60} value={delayMin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelayMin(Number(e.target.value))} className="w-16 h-8 text-center" />
                <span className="text-sm text-muted-foreground">–</span>
                <Input type="number" min={1} max={60} value={delayMax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelayMax(Number(e.target.value))} className="w-16 h-8 text-center" />
              </div>
            </div>
            <Button onClick={generate} disabled={generating || !skillId || effectiveCount === 0} variant={results.length > 0 ? "outline" : "default"}>
              {generating ? "Evaluating..." : results.length > 0 ? `Re-evaluate (${effectiveCount})` : `Evaluate ${effectiveCount} student${effectiveCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )}
        {/* Select all / unselect all / export */}
        {unrepliedStudents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
            <Button size="sm" variant="ghost" onClick={selectAll} disabled={skipped.size === 0}>
              Select all
            </Button>
            <Button size="sm" variant="ghost" onClick={unselectAll} disabled={skipped.size === unrepliedStudents.length}>
              Unselect all
            </Button>
            <span className="text-xs text-muted-foreground">
              {activeUnreplied.length} of {unrepliedStudents.length} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => setShowExport(true)}
              disabled={activeUnreplied.length === 0}
            >
              Download JSON ({activeUnreplied.length})
            </Button>
          </div>
        )}
      </div>

      {/* Export / Upload dialog */}
      {showExport && (
        <ExportDialog
          open={showExport}
          onClose={() => setShowExport(false)}
          selectedPosts={activeUnreplied}
          promptPost={posts.find((p) => p.depth === 0)}
          discussionTitle={posts.find((p) => p.depth === 0)?.subject || "Diskusi"}
          onLoadDrafts={loadAiDrafts}
        />
      )}

      {/* Unscored quick-list */}
      {allUnscored.length > 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Not scored ({allUnscored.length}) — click to jump
          </p>
          <div className="flex flex-wrap gap-2">
            {allUnscored.map((p) => (
              <button
                key={p.postId}
                onClick={() => focusPost(p.postId)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors
                  ${myReplyFor(p.postId)
                    ? "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50"
                    : "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50"
                  }`}
              >
                {p.author}
                {myReplyFor(p.postId) ? " · replied" : " · unreplied"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thread — unreplied students get inline draft below their post */}
      <PostThread
        posts={posts}
        highlightPostId={highlightPostId}
        renderActions={(p) => {
          if (p.depth === 0 || p.isMyPost) return null;
          if (myReplyFor(p.postId)) return null;

          const isDone = (postStatuses.get(p.postId) ?? "idle") === "done";
          const isSkipped = skipped.has(p.postId);
          const result = results.find((r) => r.postId === p.postId);
          const busy = generatingOne === p.postId;

          if (isDone) {
            return <Badge variant="default" className="text-xs mt-2">Posted</Badge>;
          }

          return (
            <div className="w-full">
              {/* Em dash = likely AI-written */}
              {hasEmDash(stripHtml(p.contentHtml)) && (
                <div className="mt-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                    ⚠ Em dash detected — likely AI
                  </span>
                </div>
              )}
              {/* Batch skip + quick generate buttons */}
              <div className="flex items-center gap-2 mt-2">
                <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={!isSkipped} onChange={() => toggleSkip(p.postId)} title="Uncheck to skip from batch" />
                  Include in batch
                </label>
                {!result && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => generateOne(p)} disabled={busy || !skillId}>
                      {busy ? "..." : "AI Reply"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => manualReply(p)}>
                      Manual
                    </Button>
                  </>
                )}
              </div>

              {/* Inline draft */}
              {result && (
                <InlineDraftCard
                  result={result}
                  post={p}
                  posts={posts}
                  status={postStatuses.get(p.postId) ?? "idle"}
                  regenerating={generatingOne === p.postId}
                  credentialId={credentialId}
                  courseId={courseId}
                  forumId={forumId}
                  discId={discId}
                  discussionUrl={discussionUrl}
                  delayMin={delayMin}
                  delayMax={delayMax}
                  skillId={skillId}
                  onDraftChange={(draft) => updateDraft(p.postId, draft)}
                  onScoreChange={(score) => updateScore(p.postId, score)}
                  onDone={() => setStatus(p.postId, "done")}
                  onRegenerate={() => generateOne(p)}
                />
              )}
            </div>
          );
        }}
      />

      {/* Replied but not scored */}
      {repliedNotScored.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Replied — awaiting score ({repliedNotScored.length})
          </p>
          {repliedNotScored.map((p) => (
            <RepliedStudentCard key={p.postId} post={p} myReply={myReplyFor(p.postId)!} noScore />
          ))}
        </div>
      )}

      {/* Already-replied students (collapsed) */}
      {repliedStudents.filter((p) => p.rating !== null).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Already replied ({repliedStudents.filter((p) => p.rating !== null).length})
          </p>
          {repliedStudents.filter((p) => p.rating !== null).map((p) => (
            <RepliedStudentCard key={p.postId} post={p} myReply={myReplyFor(p.postId)!} />
          ))}
        </div>
      )}
    </div>
  );
}
