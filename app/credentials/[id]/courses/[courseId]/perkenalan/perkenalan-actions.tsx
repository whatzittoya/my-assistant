"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { CollapsibleContent } from "@/components/post-thread";
import type { DiscussionWithPosts } from "@/lib/discussions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** The student's own introduction = root post of their thread. */
function rootPost(t: DiscussionWithPosts) {
  return t.posts.find((p) => p.depth === 0 && !p.parentPostId) ?? t.posts[0];
}

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

// ── AI export / import ────────────────────────────────────────────────────────

type AiResult = {
  postId: string;
  name?: string;
  reply: string;
  ai_score?: number;
  duplicate_confidence?: number;
  duplicate_of?: string | null;
};

function buildInstruction(courseName: string) {
  return `Kamu membantu dosen membalas perkenalan mahasiswa di Forum Perkenalan mata kuliah "${courseName}".
"postId" pada input adalah id diskusi — kembalikan persis sama.

Aturan balasan:
- Gunakan Bahasa Indonesia.
- Jawab salam mahasiswa (Assalamualaikum → Waalaikumsalam, Shalom → Shalom, Om Swastyastu → Om Swastyastu). Kalau tidak ada salam, buka dengan sapaan biasa.
- Tutup dengan "Salam kenal, [nama panggilan]" — nama panggilan diambil dari nama depan mahasiswa atau panggilan yang ia sebut sendiri.
- Singkat saja, 2–3 kalimat.

Kembalikan HANYA JSON — tanpa markdown, tanpa teks lain:
{
  "results": [
    {
      "postId": "<postId sama seperti input>",
      "name": "<nama mahasiswa>",
      "reply": "<balasan dosen dalam Bahasa Indonesia>"
    }
  ]
}`;
}

function buildBatchJson(threads: DiscussionWithPosts[]) {
  return JSON.stringify(
    {
      students: threads.map((t) => {
        const root = rootPost(t);
        return {
          postId: t.discussion.id,
          author: root?.author ?? t.discussion.startedBy,
          datetime: root?.datetimeIso ?? t.discussion.lastPostDate,
          title: t.discussion.title,
          content: stripHtml(root?.contentHtml ?? ""),
        };
      }),
    },
    null,
    2,
  );
}

function ExportDialog({
  open,
  onClose,
  threads,
  courseName,
  onLoadDrafts,
}: {
  open: boolean;
  onClose: () => void;
  threads: DiscussionWithPosts[];
  courseName: string;
  onLoadDrafts: (results: AiResult[]) => void;
}) {
  const [tab, setTab] = useState<"instruction" | "batch" | "upload">("instruction");
  const [uploadText, setUploadText] = useState("");
  const [parseError, setParseError] = useState("");
  const [parsed, setParsed] = useState<AiResult[]>([]);

  const instruction = buildInstruction(courseName);
  const batchJson = buildBatchJson(threads);

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
      if (results.length === 0) {
        setParseError("No results array found.");
        return;
      }
      const valid = results.filter(
        (r) => typeof r.postId === "string" && typeof r.reply === "string" && r.reply.trim(),
      );
      if (valid.length === 0) {
        setParseError("Items missing postId / reply fields.");
        return;
      }
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
    { id: "batch" as const, label: `Batch JSON (${threads.length})` },
    { id: "upload" as const, label: "Upload AI Result" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export for AI / Import Result</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-0 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
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
                Send this first to the AI to set context. Then send the Batch JSON separately.
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

          {tab === "batch" && (
            <>
              <p className="text-xs text-muted-foreground">
                All {threads.length} selected introductions in one batch. Paste this to the AI
                after the instruction.
              </p>
              <Button size="sm" variant="outline" onClick={() => copy(batchJson)}>
                Copy JSON
              </Button>
              <textarea
                readOnly
                value={batchJson}
                className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none"
              />
            </>
          )}

          {tab === "upload" && (
            <>
              <p className="text-xs text-muted-foreground">
                Paste the AI JSON response. Preview, then load as drafts.
              </p>
              <Textarea
                value={uploadText}
                onChange={(e) => parseUpload(e.target.value)}
                rows={8}
                className="text-xs font-mono"
                placeholder='{"results":[{"postId":"...","reply":"..."}]}'
              />
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
              {parsed.length > 0 && (
                <>
                  <div className="space-y-1.5">
                    {parsed.map((r) => (
                      <div key={r.postId} className="rounded border p-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{r.name ?? r.postId}</span>
                          {typeof r.ai_score === "number" && (
                            <Badge variant="outline" className="text-xs">AI {r.ai_score}%</Badge>
                          )}
                          {typeof r.duplicate_confidence === "number" &&
                            r.duplicate_confidence > 50 && (
                              <Badge variant="destructive" className="text-xs">
                                Copy {r.duplicate_confidence}%
                              </Badge>
                            )}
                        </div>
                        <p className="mt-1 text-muted-foreground">{r.reply}</p>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" onClick={loadDrafts}>
                    Load {parsed.length} draft{parsed.length !== 1 ? "s" : ""}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type SendStatus = "idle" | "sending" | "done" | "error";

export function PerkenalanActions({
  credentialId,
  courseId,
  courseName,
  initialThreads,
}: {
  credentialId: string;
  courseId: string;
  courseName: string;
  initialThreads: DiscussionWithPosts[];
}) {
  const router = useRouter();

  // Default selection: everything not yet replied.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialThreads.filter((t) => !t.discussion.iReplied).map((t) => t.discussion.id)),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, AiResult>>({});
  const [status, setStatus] = useState<Record<string, SendStatus>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(6);

  const selectedThreads = useMemo(
    () => initialThreads.filter((t) => selected.has(t.discussion.id)),
    [initialThreads, selected],
  );

  const draftCount = initialThreads.filter(
    (t) => selected.has(t.discussion.id) && drafts[t.discussion.id]?.trim(),
  ).length;
  const doneCount = Object.values(status).filter((s) => s === "done").length;
  const unrepliedCount = initialThreads.filter((t) => !t.discussion.iReplied).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(initialThreads.map((t) => t.discussion.id)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  function selectUnreplied() {
    setSelected(
      new Set(initialThreads.filter((t) => !t.discussion.iReplied).map((t) => t.discussion.id)),
    );
  }

  function loadDrafts(results: AiResult[]) {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of results) next[r.postId] = r.reply;
      return next;
    });
    setMeta((prev) => {
      const next = { ...prev };
      for (const r of results) next[r.postId] = r;
      return next;
    });
  }

  async function refreshThreads() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/actions/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success(`${json.total} threads scraped`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function sendAll() {
    const items = initialThreads
      .filter(
        (t) =>
          selected.has(t.discussion.id) &&
          drafts[t.discussion.id]?.trim() &&
          status[t.discussion.id] !== "done",
      )
      .map((t) => ({
        discussionId: t.discussion.id,
        courseId,
        discussionUrl: t.discussion.url,
        reply: drafts[t.discussion.id],
      }));

    if (items.length === 0) {
      toast.error("No drafts to send");
      return;
    }

    setSending(true);
    setStatus((prev) => {
      const next = { ...prev };
      for (const item of items) next[item.discussionId] = "sending";
      return next;
    });

    try {
      const res = await fetch("/api/actions/post-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, items, delayMin, delayMax }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const results: Array<{ discussionId: string; status: "ok" | "error" }> = json.results ?? [];
      setStatus((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.discussionId] = r.status === "ok" ? "done" : "error";
        return next;
      });

      const ok = results.filter((r) => r.status === "ok").length;
      const failed = results.filter((r) => r.status === "error").length;
      if (failed > 0) toast.error(`${ok} sent, ${failed} failed — check activity log`);
      else toast.success(`${ok} replies posted to UT`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setStatus((prev) => {
        const next = { ...prev };
        for (const item of items) next[item.discussionId] = "idle";
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  if (initialThreads.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          No threads collected yet. Scrape the forum first.
        </p>
        <Button onClick={refreshThreads} disabled={refreshing}>
          {refreshing ? "Scraping..." : "Scrape forum"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <span className="text-sm">
          <strong>{selected.size}</strong> / {initialThreads.length} selected
          {unrepliedCount > 0 && (
            <span className="text-muted-foreground"> · {unrepliedCount} not replied</span>
          )}
        </span>

        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={selectAll}>All</Button>
          <Button size="sm" variant="ghost" onClick={selectUnreplied}>Unreplied</Button>
          <Button size="sm" variant="ghost" onClick={selectNone}>None</Button>
        </div>

        <Button
          variant="outline"
          onClick={() => setExportOpen(true)}
          disabled={selected.size === 0}
        >
          Export for AI ({selected.size})
        </Button>

        <Button size="sm" variant="ghost" onClick={refreshThreads} disabled={refreshing}>
          {refreshing ? "Scraping..." : "Re-scrape"}
        </Button>

        {draftCount > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Delay</span>
              <Input
                type="number"
                min={1}
                max={600}
                value={delayMin}
                onChange={(e) => setDelayMin(Number(e.target.value))}
                className="w-16 h-8 text-center"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                min={1}
                max={600}
                value={delayMax}
                onChange={(e) => setDelayMax(Number(e.target.value))}
                className="w-16 h-8 text-center"
              />
              <span className="text-muted-foreground">sec</span>
            </div>
            <Button onClick={sendAll} disabled={sending}>
              {sending
                ? "Posting..."
                : `Send ${draftCount} ${draftCount === 1 ? "reply" : "replies"} to UT`}
            </Button>
          </>
        )}

        {doneCount > 0 && !sending && (
          <span className="text-sm text-green-600 dark:text-green-400">{doneCount} replied</span>
        )}
      </div>

      {/* Threads */}
      <div className="space-y-3">
        {initialThreads.map((t) => {
          const d = t.discussion;
          const root = rootPost(t);
          const isSelected = selected.has(d.id);
          const draft = drafts[d.id];
          const m = meta[d.id];
          const st = status[d.id];

          return (
            <div
              key={d.id}
              className={`rounded-lg border p-3 ${isSelected ? "" : "opacity-60"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(d.id)}
                  title="Include in batch"
                />
                <span className="font-semibold text-sm">
                  {root?.author ?? d.startedBy}
                </span>
                <span className="text-xs text-muted-foreground">
                  {d.title} · {fmtDate(root?.datetimeIso ?? d.lastPostDate)}
                </span>
                {d.iReplied ? (
                  <Badge variant="default" className="text-xs">Replied</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">No reply</Badge>
                )}
                {typeof m?.ai_score === "number" && (
                  <Badge variant="outline" className="text-xs">AI {m.ai_score}%</Badge>
                )}
                {typeof m?.duplicate_confidence === "number" && m.duplicate_confidence > 50 && (
                  <Badge variant="destructive" className="text-xs">
                    Copy {m.duplicate_confidence}%
                  </Badge>
                )}
                {st === "sending" && <Badge variant="secondary" className="text-xs">Posting...</Badge>}
                {st === "done" && <Badge variant="default" className="text-xs">Posted</Badge>}
                {st === "error" && <Badge variant="destructive" className="text-xs">Failed</Badge>}

                <span className="ml-auto flex items-center gap-2 text-xs">
                  <Link
                    href={`/credentials/${credentialId}/courses/${courseId}/discussions/${d.id}`}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Detail
                  </Link>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Open on UT"
                  >
                    ↗
                  </a>
                </span>
              </div>

              <div className="mt-2 text-sm">
                {root ? (
                  <CollapsibleContent html={root.contentHtml} />
                ) : (
                  <p className="text-muted-foreground">No post content collected.</p>
                )}
              </div>

              {draft !== undefined && st !== "done" && (
                <div className="mt-3 space-y-1 rounded-lg border bg-muted/40 p-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Draft reply
                  </span>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    rows={4}
                    className="text-sm bg-background"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        threads={selectedThreads}
        courseName={courseName}
        onLoadDrafts={loadDrafts}
      />
    </div>
  );
}
