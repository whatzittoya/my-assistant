"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { SkillManager } from "@/components/skill-manager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TugasSubmission, TugasMeta, PedomanItem, CriteriaScore } from "@/types";
import type { Skill } from "@/lib/skills";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewingFile = {
  userId: string;
  studentName: string;
  filename: string;
  localPath: string;
};

type EvalResult = {
  userId: string;
  name: string;
  criteriaScores: CriteriaScore[];
  totalScore: number;
  reasoning: string;
  feedback: string;
  error?: string;
};

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

const MODELS = [
  { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro Preview" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
];

type UploadedResult = {
  userId?: string;
  name?: string;
  criteriaScores?: { id?: string; criteria?: string; score: number; maxScore: number }[];
  totalScore?: number;
  reasoning?: string;
  feedback?: string;
  score?: number;
};

// ── Export / Upload dialog ─────────────────────────────────────────────────────

function TugasExportDialog({
  open, onClose, instruction, studentsJson, onLoadResults,
}: {
  open: boolean;
  onClose: () => void;
  instruction: string;
  studentsJson: string;
  onLoadResults: (results: UploadedResult[]) => void;
}) {
  const [tab, setTab] = useState<"instruction" | "students" | "upload">("instruction");
  const [uploadText, setUploadText] = useState("");
  const [parseError, setParseError] = useState("");
  const [parsed, setParsed] = useState<UploadedResult[]>([]);

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
      const items: UploadedResult[] = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
      if (items.length === 0) { setParseError("No results array found."); return; }
      const valid = items.filter((r) => {
        const hasNew = Array.isArray(r.criteriaScores) && typeof r.totalScore === "number" && typeof r.feedback === "string";
        const hasLegacy = typeof r.score === "number" && typeof r.feedback === "string";
        return hasNew || hasLegacy;
      });
      if (valid.length === 0) { setParseError("Items missing required fields."); return; }
      setParsed(valid);
    } catch (e) {
      setParseError(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function loadResults() {
    onLoadResults(parsed);
    setUploadText(""); setParsed([]);
    onClose();
    toast.success(`Loaded ${parsed.length} result${parsed.length !== 1 ? "s" : ""}`);
  }

  const tabs = [
    { id: "instruction" as const, label: "Instruction" },
    { id: "students" as const, label: "Assignment JSON" },
    { id: "upload" as const, label: "Upload Result" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Export for AI / Import Result</DialogTitle></DialogHeader>
        <div className="flex gap-0 border-b">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto space-y-3 pt-3">
          {tab === "instruction" && (
            <>
              <p className="text-xs text-muted-foreground">Send this as system prompt, then send Assignment JSON.</p>
              <Button size="sm" variant="outline" onClick={() => copy(instruction)}>Copy instruction</Button>
              <textarea readOnly value={instruction} className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none" />
            </>
          )}
          {tab === "students" && (
            <>
              <p className="text-xs text-muted-foreground">Paste this to the AI after the instruction.</p>
              <Button size="sm" variant="outline" onClick={() => copy(studentsJson)}>Copy JSON</Button>
              <textarea readOnly value={studentsJson} className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none" />
            </>
          )}
          {tab === "upload" && (
            <>
              <p className="text-xs text-muted-foreground">Paste AI response JSON. Supports <code>criteriaScores</code> (new) and <code>score</code> (legacy) formats.</p>
              <Textarea value={uploadText} onChange={(e) => parseUpload(e.target.value)} rows={8} className="text-xs font-mono"
                placeholder={'{"results":[{"name":"...","criteriaScores":[...],"totalScore":85,"reasoning":"...","feedback":"..."}]}'} />
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
              {parsed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">{parsed.length} parsed:</p>
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {parsed.map((r, i) => {
                      const total = r.totalScore ?? r.score ?? 0;
                      return (
                        <div key={i} className="rounded border p-2 text-xs flex items-center gap-2">
                          <span className="font-semibold flex-1">{r.name ?? r.userId ?? `#${i + 1}`}</span>
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreColorPct(total, 100)}`}>{total}</span>
                          {r.criteriaScores && r.criteriaScores.length > 0 && <span className="text-muted-foreground">{r.criteriaScores.length} criteria</span>}
                          <span className="text-muted-foreground truncate max-w-[200px]">{r.feedback}</span>
                        </div>
                      );
                    })}
                  </div>
                  <Button size="sm" onClick={loadResults}>Load {parsed.length} as results</Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderHtml(html: string) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function scoreColorPct(score: number, max: number) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 80) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (pct >= 60) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

function scoreColor(score: number) {
  return scoreColorPct(score, 100);
}


function statusBadge(status: string) {
  const lower = status.toLowerCase();
  if (lower.includes("graded"))
    return <Badge variant="outline" className="border-blue-400 text-blue-700 dark:text-blue-300 text-xs">Graded</Badge>;
  if (lower.includes("submitted"))
    return <Badge variant="outline" className="border-green-400 text-green-700 dark:text-green-300 text-xs">Submitted</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

// ── Section box ───────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// ── Expanded row: criteria breakdown + feedback quick-edit ────────────────────

function ExpandedRow({
  submission,
  result,
  pedomanItems,
  totalMax,
  assignId,
  credentialId,
  courseId,
  onResultUpdate,
  onEvaluate,
  evaluating,
  postStatus,
}: {
  submission: TugasSubmission;
  result: EvalResult | undefined;
  pedomanItems: PedomanItem[];
  totalMax: number;
  assignId: string;
  credentialId: string;
  courseId: string;
  onResultUpdate: (userId: string, result: EvalResult) => void;
  onEvaluate: (userIds: string[]) => void;
  evaluating: boolean;
  postStatus?: "ok" | "skipped" | "error";
}) {
  const aiEval = submission.aiEval;
  const finalEval = submission.finalEval;

  // Local editable state — prefer result in-memory, then finalEval, then aiEval
  const defaultCriteria: CriteriaScore[] =
    result?.criteriaScores.length
      ? result.criteriaScores
      : finalEval?.criteriaScores.length
        ? finalEval.criteriaScores
        : aiEval?.criteriaScores.length
          ? aiEval.criteriaScores
          : pedomanItems.map((p) => ({ id: p.id, criteria: p.criteria, score: 0, maxScore: p.maxScore }));

  const defaultFeedback =
    result?.feedback ?? finalEval?.feedback ?? aiEval?.feedback ?? "";
  const defaultReasoning = result?.reasoning ?? aiEval?.reasoning ?? "";

  const [editCriteria, setEditCriteria] = useState<CriteriaScore[]>(defaultCriteria);
  const [editFeedback, setEditFeedback] = useState(defaultFeedback);
  const [saving, setSaving] = useState(false);

  // Sync when result changes externally (e.g. after evaluate)
  useEffect(() => {
    if (result?.criteriaScores.length) setEditCriteria(result.criteriaScores);
    if (result?.feedback) setEditFeedback(result.feedback);
  }, [result]);

  const editTotal = editCriteria.reduce((s, c) => s + c.score, 0);

  function updateScore(i: number, score: number) {
    setEditCriteria((prev) => prev.map((c, idx) => idx === i ? { ...c, score } : c));
  }

  async function saveFinal() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/tugas/${assignId}/submissions/${submission.userId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credentialId,
            courseId,
            type: "final",
            criteriaScores: editCriteria,
            feedback: editFeedback,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      // Update in-memory result so parent stays consistent
      onResultUpdate(submission.userId, {
        userId: submission.userId,
        name: submission.name,
        criteriaScores: editCriteria,
        totalScore: editTotal,
        reasoning: defaultReasoning,
        feedback: editFeedback,
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const aiTotal = aiEval?.totalScore ?? result?.totalScore;
  const finalTotal = finalEval?.totalScore;

  return (
    <TableRow>
      <TableCell colSpan={9} className="bg-muted/20 p-0 max-w-0 overflow-hidden">
        <div className="p-4 space-y-4 w-full overflow-hidden">
          {/* Scores header */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {aiTotal !== undefined && (
              <span>
                AI score:{" "}
                <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreColorPct(aiTotal, totalMax)}`}>
                  {aiTotal}/{totalMax}
                </span>
              </span>
            )}
            {finalTotal !== undefined && (
              <span>
                Final score:{" "}
                <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreColorPct(finalTotal, totalMax)}`}>
                  {finalTotal}/{totalMax}
                </span>
              </span>
            )}
          </div>

          {/* Criteria breakdown (editable) */}
          {editCriteria.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Score Breakdown</p>
              <div className="rounded border overflow-hidden">
                <table className="w-full text-xs table-fixed">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-1.5 text-left font-medium w-auto">Criteria</th>
                      <th className="px-3 py-1.5 text-center font-medium w-24">Score</th>
                      <th className="px-3 py-1.5 text-center font-medium w-16">Max</th>
                      {aiEval?.criteriaScores.length ? (
                        <th className="px-3 py-1.5 text-center font-medium w-20 text-muted-foreground">AI Score</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {editCriteria.map((c, i) => {
                      const aiCs = aiEval?.criteriaScores.find((a) => a.criteria === c.criteria);
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-1.5 overflow-hidden">{renderHtml(c.criteria)}</td>
                          <td className="px-3 py-1.5 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={c.maxScore}
                              value={c.score}
                              onChange={(e) => updateScore(i, Number(e.target.value))}
                              className={`w-16 h-6 text-center text-xs font-semibold rounded-full border-0 mx-auto ${scoreColorPct(c.score, c.maxScore)}`}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center text-muted-foreground">{c.maxScore}</td>
                          {aiEval?.criteriaScores.length ? (
                            <td className="px-3 py-1.5 text-center text-muted-foreground">
                              {aiCs?.score ?? "—"}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                    <tr className="bg-muted/30 font-semibold">
                      <td className="px-3 py-1.5 w-0 min-w-0">Total</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColorPct(editTotal, totalMax)}`}>
                          {editTotal}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center text-muted-foreground">{totalMax}</td>
                      {aiEval?.criteriaScores.length ? (
                        <td className="px-3 py-1.5 text-center text-muted-foreground">{aiTotal ?? "—"}</td>
                      ) : null}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI reasoning (read-only) */}
          {defaultReasoning && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">AI Reasoning</p>
              <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">{defaultReasoning}</p>
            </div>
          )}

          {/* Feedback (editable) */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Feedback Comment</p>
            <Textarea
              value={editFeedback}
              onChange={(e) => setEditFeedback(e.target.value)}
              rows={3}
              className="text-sm"
              placeholder="Feedback to student..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={saveFinal} disabled={saving}>
              {saving ? "Saving..." : "Save as final"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onEvaluate([submission.userId])} disabled={evaluating}>
              {evaluating ? "..." : "Re-evaluate"}
            </Button>
            <Link
              href={`/credentials/${credentialId}/courses/${courseId}/tugas/${assignId}/submissions/${submission.userId}`}
              className="text-xs text-primary hover:underline ml-1"
            >
              Open detail ↗
            </Link>
            {postStatus === "ok" && <Badge variant="default" className="text-xs">Posted</Badge>}
            {postStatus === "skipped" && <Badge variant="secondary" className="text-xs">Skipped</Badge>}
            {postStatus === "error" && <Badge variant="destructive" className="text-xs">Failed</Badge>}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TugasActions({
  credentialId,
  courseId,
  assignId,
  tugasUrl,
  initialSubmissions,
  initialMeta,
}: {
  credentialId: string;
  courseId: string;
  assignId: string;
  tugasUrl: string;
  initialSubmissions: TugasSubmission[];
  initialMeta: TugasMeta;
}) {
  const [submissions, setSubmissions] = useState<TugasSubmission[]>(initialSubmissions);
  const [collecting, setCollecting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillId, setSkillId] = useState("");
  const [model, setModel] = useState(MODELS[0].id);

  const [description, setDescription] = useState(initialMeta.description);
  const [pedomanItems, setPedomanItems] = useState<PedomanItem[]>(
    initialMeta.pedomanItems.length > 0
      ? initialMeta.pedomanItems
      : [{ id: genId(), criteria: "", maxScore: 100 }],
  );
  const [savingMeta, setSavingMeta] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSubmissions.map((s) => s.userId)),
  );

  const [viewingFile, setViewingFile] = useState<ViewingFile | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const lsKey = `tugas-eval-${assignId}`;
  const [evaluating, setEvaluating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postStatuses, setPostStatuses] = useState<Record<string, "ok" | "skipped" | "error">>({});
  const [results, setResults] = useState<EvalResult[]>([]);

  // Load from localStorage after hydration to avoid SSR/client mismatch
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(lsKey) ?? "[]");
      if (stored.length > 0) setResults(stored);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  useEffect(() => {
    try { localStorage.setItem(lsKey, JSON.stringify(results)); } catch { /* quota */ }
  }, [results, lsKey]);

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

  const totalMax = pedomanItems.reduce((sum, item) => sum + item.maxScore, 0) || 100;

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function deleteAll() {
    if (!confirm("Delete all submissions and downloaded files? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/tugas/${assignId}?credentialId=${credentialId}&courseId=${courseId}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setSubmissions([]);
      setSelected(new Set());
      clearAllResults();
      toast.success(`Deleted ${json.deleted} submission${json.deleted !== 1 ? "s" : ""} and files`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteAndRescrape() {
    if (!confirm("Delete all submissions and re-collect from UT LMS?")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/tugas/${assignId}?credentialId=${credentialId}&courseId=${courseId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      setSubmissions([]);
      setSelected(new Set());
      setResults([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
      return;
    }
    setDeleting(false);
    await collect();
  }

  // ── Collect ────────────────────────────────────────────────────────────────

  async function collect(downloadFiles = true) {
    setCollecting(true);
    try {
      const res = await fetch("/api/actions/tugas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, assignId, downloadFiles }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const listRes = await fetch(
        `/api/tugas/${assignId}?credentialId=${credentialId}&courseId=${courseId}`,
      );
      if (listRes.ok) {
        const items = (await listRes.json()).items ?? [];
        setSubmissions(items);
        setSelected(new Set(items.filter((s: TugasSubmission) => !s.status.toLowerCase().includes("graded")).map((s: TugasSubmission) => s.userId)));
      }
      toast.success(`Collected ${json.count} submission${json.count !== 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setCollecting(false);
    }
  }

  // ── Save meta ──────────────────────────────────────────────────────────────

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/tugas/${assignId}/meta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, description, pedomanItems }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingMeta(false);
    }
  }

  function updatePedomanItem(index: number, field: keyof PedomanItem, value: string | number) {
    setPedomanItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  function addPedomanItem() {
    setPedomanItems((prev) => [...prev, { id: genId(), criteria: "", maxScore: 0 }]);
  }

  function removePedomanItem(index: number) {
    setPedomanItems((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Evaluate ───────────────────────────────────────────────────────────────

  async function evaluate(userIds?: string[]) {
    if (!skillId) { toast.error("Select a skill first"); return; }
    setEvaluating(true);
    let count = 0;
    let errors = 0;
    try {
      const res = await fetch("/api/actions/evaluate-tugas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, assignId, skillId, model, userIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const result: EvalResult = JSON.parse(line);
            setResults((prev) => [...prev.filter((r) => r.userId !== result.userId), result]);
            // Also update the submission in-state so expanded row reflects new aiEval
            setSubmissions((prev) =>
              prev.map((s) =>
                s.userId === result.userId
                  ? {
                      ...s,
                      aiEval: {
                        criteriaScores: result.criteriaScores,
                        totalScore: result.totalScore,
                        reasoning: result.reasoning,
                        feedback: result.feedback,
                        generatedAt: new Date().toISOString(),
                      },
                    }
                  : s,
              ),
            );
            if (result.error) errors++; else count++;
          } catch { /* malformed line */ }
        }
      }

      toast.success(
        errors > 0
          ? `Evaluated ${count} students, ${errors} failed`
          : `Evaluated ${count} student${count !== 1 ? "s" : ""}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEvaluating(false);
    }
  }

  function toggleSelect(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(submissions.filter((s) => !s.status.toLowerCase().includes("graded")).map((s) => s.userId))); }
  function unselectAll() { setSelected(new Set()); }

  function toggleExpand(userId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  // ── Export instruction ─────────────────────────────────────────────────────

  const activePedoman = pedomanItems.filter((item) => item.criteria.trim());

  const pedomanBlock =
    activePedoman.length > 0
      ? [
          `Pedoman Penilaian (Total Maks. ${totalMax} poin):`,
          ...activePedoman.map(
            (item, i) => `${i + 1}. [id:${item.id}] ${item.criteria} — maks. ${item.maxScore} poin`,
          ),
          `\nKembalikan criteriaScores dengan field "id" (gunakan ID dalam tanda kurung di atas), "score", dan "maxScore" saja.`,
          `totalScore adalah jumlah semua skor kriteria (0–${totalMax}).`,
        ].join("\n")
      : "";

  const exportInstruction = [
    skills.find((s) => s.id === skillId)?.systemPrompt ?? "",
    description ? `\nDeskripsi Tugas:\n${description}` : "",
    pedomanBlock || "",
    `\nFormat kembalikan JSON:\n${JSON.stringify(
      {
        results: [
          {
            userId: "...",
            name: "...",
            criteriaScores: activePedoman.map((p) => ({
              id: p.id,
              score: 0,
              maxScore: p.maxScore,
            })),
            totalScore: 0,
            reasoning: "...",
            feedback: "...",
          },
        ],
      },
      null,
      2,
    )}`,
  ].filter(Boolean).join("\n\n");

  const exportStudentsJson = JSON.stringify(
    {
      students: submissions
        .filter((s) => selected.has(s.userId))
        .map((s) => ({
          userId: s.userId,
          name: s.name,
          files: s.files.map((f) =>
            f.localPath ? f.localPath.split("/").pop()! : f.filename
          ),
        })),
    },
    null,
    2,
  );

  // ── Import from JSON (external AI) ────────────────────────────────────────

  async function loadUploadedResults(uploaded: UploadedResult[]) {
    for (const r of uploaded) {
      const match = submissions.find(
        (s) => s.userId === r.userId || s.name === r.name,
      );
      if (!match) continue;

      // Normalize: new format vs legacy; ensure id field present
      const criteriaScores: CriteriaScore[] = Array.isArray(r.criteriaScores) && r.criteriaScores.length > 0
        ? r.criteriaScores.map((c) => ({ id: c.id ?? "", criteria: c.criteria ?? "", score: c.score ?? 0, maxScore: c.maxScore ?? 0 }))
        : [];
      const totalScore = r.totalScore ?? r.score ?? 0;
      const reasoning = r.reasoning ?? "";
      const feedback = r.feedback ?? "";

      const evalData = { criteriaScores, totalScore, reasoning, feedback };

      // Save to Firestore
      try {
        await fetch(`/api/tugas/${assignId}/submissions/${match.userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credentialId,
            courseId,
            type: "ai",
            ...evalData,
          }),
        });
      } catch { /* non-blocking */ }

      // Update in-memory
      setResults((prev) => [
        ...prev.filter((x) => x.userId !== match.userId),
        { userId: match.userId, name: r.name ?? match.name, ...evalData },
      ]);
      setSubmissions((prev) =>
        prev.map((s) =>
          s.userId === match.userId
            ? {
                ...s,
                aiEval: { ...evalData, generatedAt: new Date().toISOString() },
              }
            : s,
        ),
      );
    }
  }

  function updateResult(userId: string, partial: Partial<EvalResult>) {
    setResults((prev) =>
      prev.map((r) => r.userId === userId ? { ...r, ...partial } : r),
    );
  }

  function clearResult(userId: string) {
    setResults((prev) => prev.filter((r) => r.userId !== userId));
  }

  function clearAllResults() {
    setResults([]);
    setPostStatuses({});
    try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
  }

  async function postGrades() {
    // Collect not-graded submissions that have a finalEval or aiEval score
    const toPost = submissions
      .filter((s) => !s.status.toLowerCase().includes("graded"))
      .flatMap((s) => {
        const eval_ = s.finalEval ?? s.aiEval;
        if (!eval_) return [];
        return [{ userId: s.userId, score: eval_.totalScore, feedback: eval_.feedback }];
      });

    if (toPost.length === 0) {
      toast.error("No ungraded submissions with a score to post");
      return;
    }

    if (!confirm(`Post grades for ${toPost.length} ungraded submission${toPost.length !== 1 ? "s" : ""}?`)) return;

    setPosting(true);
    try {
      const res = await fetch("/api/actions/grade-tugas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, assignId, grades: toPost }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const statuses: Record<string, "ok" | "skipped" | "error"> = {};
      for (const r of json.results ?? []) statuses[r.userId] = r.status;
      setPostStatuses(statuses);

      const { ok, skipped, errors } = json.summary ?? {};
      toast.success(`Posted: ${ok} graded, ${skipped} skipped, ${errors} errors`);

      // Re-collect without downloading files to refresh statuses from UT
      const recollectRes = await fetch("/api/actions/tugas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, assignId, downloadFiles: false }),
      });
      if (recollectRes.ok) {
        const listRes = await fetch(
          `/api/tugas/${assignId}?credentialId=${credentialId}&courseId=${courseId}`,
        );
        if (listRes.ok) {
          const items = (await listRes.json()).items ?? [];
          setSubmissions(items);
        }
        toast.info("Refreshed submission statuses from UT");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPosting(false);
    }
  }

  const ungraded = submissions.filter((s) => !s.finalGrade && !s.grade).length;
  const withFiles = submissions.filter((s) => s.files.some((f) => f.localPath));
  const selectedWithFiles = withFiles.filter((s) => selected.has(s.userId));
  const selectableSubmissions = submissions.filter((s) => !s.status.toLowerCase().includes("graded"));
  const allSelected = selectableSubmissions.length > 0 && selected.size === selectableSubmissions.length;

  const sidebarResult = viewingFile ? results.find((r) => r.userId === viewingFile.userId) : null;

  return (
    <div className="flex gap-4 items-start">
    <div className="flex-1 min-w-0 space-y-4">

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex">
          <Button
            className="rounded-r-none"
            onClick={() => collect(true)}
            disabled={collecting || deleting}
          >
            {collecting ? "Collecting..." : submissions.length > 0 ? "Re-collect" : "Collect submissions"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="rounded-l-none border-l-0 px-2"
                disabled={collecting || deleting}
              >
                ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => collect(true)}>
                Re-collect &amp; download files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => collect(false)}>
                Re-collect without downloading files
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {submissions.length > 0 && (
          <>
            <Button variant="outline" onClick={deleteAndRescrape} disabled={collecting || deleting}>
              {deleting && !collecting ? "Deleting..." : "Delete & Rescrape"}
            </Button>
            <Button variant="destructive" size="sm" onClick={deleteAll} disabled={collecting || deleting}>
              Delete
            </Button>
          </>
        )}
        <a href={tugasUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
          Open on UT ↗
        </a>
        {submissions.length > 0 && (
          <>
            <Badge variant="secondary">{submissions.length} submitted</Badge>
            {ungraded > 0 && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                {ungraded} not graded
              </Badge>
            )}
            {(() => {
              const postable = submissions.filter(
                (s) => !s.status.toLowerCase().includes("graded") && (s.finalEval ?? s.aiEval),
              ).length;
              return postable > 0 ? (
                <Button size="sm" onClick={postGrades} disabled={posting}>
                  {posting ? "Posting..." : `Post to UT (${postable})`}
                </Button>
              ) : null;
            })()}
          </>
        )}
      </div>

      {/* ── Skill + Model ── */}
      <Section title="Skill & Model">
        <SkillManager
          skills={skills}
          selectedId={skillId}
          onSelect={setSkillId}
          onSkillsChange={setSkills}
        />
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </Section>

      {/* ── Tugas Description ── */}
      <Section title="Tugas Description">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Paste the assignment description here..."
          className="text-sm"
        />
        <Button size="sm" onClick={saveMeta} disabled={savingMeta}>
          {savingMeta ? "Saving..." : "Save"}
        </Button>
      </Section>

      {/* ── Pedoman Penilaian ── */}
      <Section title={`Pedoman Penilaian${totalMax > 0 ? ` (Total: ${totalMax})` : ""}`}>
        <div className="space-y-2">
          {pedomanItems.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <Textarea
                  value={item.criteria}
                  onChange={(e) => updatePedomanItem(i, "criteria", e.target.value)}
                  rows={2}
                  placeholder={`Kriteria ${i + 1}…`}
                  className="text-sm"
                />
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Maks.</label>
                <Input
                  type="number"
                  min={0}
                  value={item.maxScore}
                  onChange={(e) => updatePedomanItem(i, "maxScore", Number(e.target.value))}
                  className="w-20 text-center text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => removePedomanItem(i)}
                disabled={pedomanItems.length === 1}
                className="mt-6 text-muted-foreground hover:text-destructive disabled:opacity-30 text-sm leading-none"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={addPedomanItem}>
              + Add criterion
            </Button>
            <span className="text-xs text-muted-foreground">
              Total maks. <strong>{totalMax}</strong> poin
            </span>
          </div>
        </div>
        <Button size="sm" onClick={saveMeta} disabled={savingMeta}>
          {savingMeta ? "Saving..." : "Save"}
        </Button>
      </Section>


      {/* ── Submissions table ── */}
      {submissions.length > 0 && (
        <Section title={`Submissions (${submissions.length})`}>
          <div className="flex items-center gap-3 pb-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => e.target.checked ? selectAll() : unselectAll()}
              />
              {allSelected ? "Unselect all" : `Select all (${selectableSubmissions.length})`}
            </label>
            <span className="text-xs text-muted-foreground">
              {selected.size} of {submissions.length} selected
            </span>
            {selected.size > 0 && (
              <>
                <Button
                  size="sm"
                  onClick={() => evaluate(Array.from(selected))}
                  disabled={evaluating || !skillId || selectedWithFiles.length === 0}
                >
                  {evaluating ? "Evaluating..." : `Evaluate (${selectedWithFiles.length})`}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowExport(true)}>
                  Export / Import
                </Button>
              </>
            )}
            {selected.size > 0 && selectedWithFiles.length === 0 && (
              <span className="text-xs text-muted-foreground">No downloaded files in selection.</span>
            )}
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-48">Name</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-24">UT Score</TableHead>
                  <TableHead className="w-28">AI Score</TableHead>
                  <TableHead className="w-28">Final Score</TableHead>
                  <TableHead className="w-36">Last Modified</TableHead>
                  <TableHead>Files</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => {
                  const result = results.find((r) => r.userId === s.userId);
                  const aiScore = result?.totalScore ?? s.aiEval?.totalScore;
                  const finalScore = s.finalEval?.totalScore;
                  const isExpanded = expandedRows.has(s.userId);

                  const isGraded = s.status.toLowerCase().includes("graded");

                  return (
                    <React.Fragment key={s.userId}>
                      <TableRow className={selected.has(s.userId) ? "" : "opacity-50"}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(s.userId)}
                            onChange={() => toggleSelect(s.userId)}
                            disabled={isGraded}
                            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleExpand(s.userId)}
                            className="text-muted-foreground hover:text-foreground text-xs"
                            title={isExpanded ? "Collapse" : "Expand"}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link
                            href={`/credentials/${credentialId}/courses/${courseId}/tugas/${assignId}/submissions/${s.userId}`}
                            className="hover:underline text-primary truncate block max-w-[11rem]"
                          >
                            {s.name}
                          </Link>
                          <div className="text-xs text-muted-foreground truncate max-w-[11rem]">{s.email}</div>
                        </TableCell>
                        <TableCell>{statusBadge(s.status)}</TableCell>
                        <TableCell>
                          {s.finalGrade != null ? (
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              {s.finalGrade}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {aiScore !== undefined ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColorPct(aiScore, totalMax)}`}>
                              {aiScore}/{totalMax}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {finalScore !== undefined ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColorPct(finalScore, totalMax)}`}>
                              {finalScore}/{totalMax}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.lastModifiedSubmission || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {s.files.length === 0 ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              s.files.map((f, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  {f.localPath ? (
                                    <button
                                      onClick={() => setViewingFile({ userId: s.userId, studentName: s.name, filename: f.filename, localPath: f.localPath! })}
                                      className={`text-xs text-primary hover:underline truncate max-w-[160px] text-left ${viewingFile?.localPath === f.localPath ? "font-semibold underline" : ""}`}
                                      title="Click to view PDF"
                                    >
                                      {f.filename}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={f.filename}>
                                      {f.filename}
                                    </span>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <ExpandedRow
                          key={`${s.userId}-expanded`}
                          submission={s}
                          result={result}
                          pedomanItems={pedomanItems}
                          totalMax={totalMax}
                          assignId={assignId}
                          credentialId={credentialId}
                          courseId={courseId}
                          onResultUpdate={(uid, r) => updateResult(uid, r)}
                          onEvaluate={evaluate}
                          evaluating={evaluating}
                          postStatus={postStatuses[s.userId]}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}

      {submissions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No submissions collected yet. Click Collect to fetch from UT LMS.
        </p>
      )}

      {showExport && (
        <TugasExportDialog
          open={showExport}
          onClose={() => setShowExport(false)}
          instruction={exportInstruction}
          studentsJson={exportStudentsJson}
          onLoadResults={loadUploadedResults}
        />
      )}
    </div>

    {/* ── PDF Sidebar ── */}
    {viewingFile && (
      <div className="w-[420px] shrink-0 sticky top-4 flex flex-col gap-3 rounded-lg border bg-card p-3" style={{ height: "calc(100vh - 100px)" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{viewingFile.filename}</p>
            <p className="text-sm font-semibold truncate">{viewingFile.studentName}</p>
          </div>
          <button onClick={() => setViewingFile(null)} className="text-muted-foreground hover:text-foreground shrink-0 text-lg leading-none">✕</button>
        </div>

        <iframe
          src={`/api/tugas/files?path=${encodeURIComponent(viewingFile.localPath)}`}
          className="flex-1 w-full rounded border bg-muted/20 min-h-0"
          title={viewingFile.filename}
        />

        <div className="space-y-2 shrink-0">
          {sidebarResult ? (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Score</label>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColorPct(sidebarResult.totalScore, totalMax)}`}>
                  {sidebarResult.totalScore}/{totalMax}
                </span>
              </div>
              {sidebarResult.criteriaScores.length > 0 && (
                <div className="space-y-0.5">
                  {sidebarResult.criteriaScores.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 text-muted-foreground truncate">{c.criteria}</span>
                      <span className={`rounded-full px-1.5 py-0.5 font-medium ${scoreColorPct(c.score, c.maxScore)}`}>
                        {c.score}/{c.maxScore}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                value={sidebarResult.feedback}
                onChange={(e) => updateResult(viewingFile.userId, { feedback: e.target.value })}
                rows={4}
                className="text-sm"
                placeholder="Feedback..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => evaluate([viewingFile.userId])} disabled={evaluating}>
                  {evaluating ? "..." : "Re-evaluate"}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">No AI result yet.</p>
              <Button size="sm" onClick={() => evaluate([viewingFile.userId])} disabled={evaluating || !skillId}>
                {evaluating ? "Evaluating..." : "Evaluate this student"}
              </Button>
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
}
