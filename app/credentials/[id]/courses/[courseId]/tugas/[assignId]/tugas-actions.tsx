"use client";

import { useEffect, useState } from "react";
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
import type { TugasSubmission, TugasMeta, PedomanItem } from "@/types";
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
  score: number;
  feedback: string;
  error?: string;
};

const MODELS = [
  { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro Preview" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
];

type UploadedResult = {
  userId?: string;
  name?: string;
  score: number;
  feedback: string;
};

// ── Export / Upload dialog ─────────────────────────────────────────────────────

function TugasExportDialog({
  open,
  onClose,
  instruction,
  studentsJson,
  onLoadResults,
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
      const items: UploadedResult[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.results)
          ? raw.results
          : [];
      if (items.length === 0) { setParseError("No results array found."); return; }
      const valid = items.filter(
        (r) => typeof r.score === "number" && typeof r.feedback === "string",
      );
      if (valid.length === 0) { setParseError("Items missing score / feedback fields."); return; }
      setParsed(valid);
    } catch (e) {
      setParseError(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function loadResults() {
    onLoadResults(parsed);
    setUploadText("");
    setParsed([]);
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
        <DialogHeader>
          <DialogTitle>Export for AI / Import Result</DialogTitle>
        </DialogHeader>

        <div className="flex gap-0 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
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
                Send this as the system/context prompt. Then send Assignment JSON separately.
              </p>
              <Button size="sm" variant="outline" onClick={() => copy(instruction)}>Copy instruction</Button>
              <textarea
                readOnly value={instruction}
                className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none"
              />
            </>
          )}

          {tab === "students" && (
            <>
              <p className="text-xs text-muted-foreground">
                Paste this to the AI after the instruction. It will return scored feedback.
              </p>
              <Button size="sm" variant="outline" onClick={() => copy(studentsJson)}>Copy JSON</Button>
              <textarea
                readOnly value={studentsJson}
                className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none"
              />
            </>
          )}

          {tab === "upload" && (
            <>
              <p className="text-xs text-muted-foreground">
                Paste the AI response JSON. Match by <code>userId</code> or <code>name</code>.
              </p>
              <Textarea
                value={uploadText}
                onChange={(e) => parseUpload(e.target.value)}
                rows={8}
                className="text-xs font-mono"
                placeholder={'{"results":[{"name":"...","score":85,"feedback":"..."}]}'}
              />
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
              {parsed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">{parsed.length} parsed:</p>
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {parsed.map((r, i) => (
                      <div key={i} className="rounded border p-2 text-xs flex items-center gap-2">
                        <span className="font-semibold flex-1">{r.name ?? r.userId ?? `#${i + 1}`}</span>
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreColor(r.score)}`}>
                          {r.score}
                        </span>
                        <span className="text-muted-foreground truncate max-w-[200px]">{r.feedback}</span>
                      </div>
                    ))}
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

function scoreColor(score: number) {
  if (score >= 80) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 60) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

function gradeBadge(grade: string | null) {
  if (!grade) return <span className="text-muted-foreground">—</span>;
  const n = parseFloat(grade);
  if (isNaN(n)) return <span className="text-sm">{grade}</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColor(n)}`}>{grade}</span>
  );
}

function statusBadge(status: string) {
  if (status.toLowerCase().includes("submitted"))
    return <Badge variant="outline" className="border-green-400 text-green-700 dark:text-green-300 text-xs">{status}</Badge>;
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
  // Submissions
  const [submissions, setSubmissions] = useState<TugasSubmission[]>(initialSubmissions);
  const [collecting, setCollecting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Skills & model
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillId, setSkillId] = useState("");
  const [model, setModel] = useState(MODELS[0].id);

  // Meta (description + pedoman)
  const [description, setDescription] = useState(initialMeta.description);
  const [pedomanItems, setPedomanItems] = useState<PedomanItem[]>(
    initialMeta.pedomanItems.length > 0
      ? initialMeta.pedomanItems
      : [{ criteria: "", maxScore: 100 }],
  );
  const [savingMeta, setSavingMeta] = useState(false);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSubmissions.map((s) => s.userId)),
  );

  // PDF sidebar
  const [viewingFile, setViewingFile] = useState<ViewingFile | null>(null);

  // Export modal
  const [showExport, setShowExport] = useState(false);

  // AI evaluation — persisted to localStorage
  const lsKey = `tugas-eval-${assignId}`;
  const [evaluating, setEvaluating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postStatuses, setPostStatuses] = useState<Record<string, "ok" | "skipped" | "error">>({});
  const [results, setResults] = useState<EvalResult[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(lsKey) ?? "[]"); } catch { return []; }
  });

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

  // ── Delete ────────────────────────────────────────────────────────────────

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

  // ── Collect ──────────────────────────────────────────────────────────────

  async function collect() {
    setCollecting(true);
    try {
      const res = await fetch("/api/actions/tugas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, assignId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const listRes = await fetch(
        `/api/tugas/${assignId}?credentialId=${credentialId}&courseId=${courseId}`,
      );
      if (listRes.ok) {
        const items = (await listRes.json()).items ?? [];
        setSubmissions(items);
        setSelected(new Set(items.map((s: TugasSubmission) => s.userId)));
      }
      toast.success(`Collected ${json.count} submission${json.count !== 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setCollecting(false);
    }
  }

  // ── Save meta ─────────────────────────────────────────────────────────────

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
    setPedomanItems((prev) => [...prev, { criteria: "", maxScore: 0 }]);
  }

  function removePedomanItem(index: number) {
    setPedomanItems((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Evaluate ──────────────────────────────────────────────────────────────

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

  function selectAll() { setSelected(new Set(submissions.map((s) => s.userId))); }
  function unselectAll() { setSelected(new Set()); }

  const totalMax = pedomanItems.reduce((sum, item) => sum + item.maxScore, 0) || 100;
  const pedomanBlock =
    pedomanItems.filter((item) => item.criteria.trim()).length > 0
      ? [
          `Pedoman Penilaian (Total Maks. ${totalMax} poin):`,
          ...pedomanItems
            .filter((item) => item.criteria.trim())
            .map((item, i) => `${i + 1}. ${item.criteria} — maks. ${item.maxScore} poin`),
          `\nBerikan skor total antara 0 sampai ${totalMax}.`,
        ].join("\n")
      : "";

  const exportInstruction = [
    skills.find((s) => s.id === skillId)?.systemPrompt ?? "",
    description ? `\nDeskripsi Tugas:\n${description}` : "",
    pedomanBlock || "",
    `\nFormat kembalikan JSON:\n{"results":[{"userId":"...","name":"...","score":0-${totalMax},"feedback":"..."}]}`,
  ].filter(Boolean).join("\n\n");

  const exportStudentsJson = JSON.stringify(
    {
      students: submissions
        .filter((s) => selected.has(s.userId))
        .map((s) => ({
          userId: s.userId,
          name: s.name,
          files: s.files.map((f) => f.filename),
        })),
    },
    null,
    2,
  );

  function loadUploadedResults(uploaded: UploadedResult[]) {
    for (const r of uploaded) {
      // Match by userId first, then by name
      const match = submissions.find(
        (s) => s.userId === r.userId || s.name === r.name,
      );
      if (!match) continue;
      setResults((prev) => [
        ...prev.filter((x) => x.userId !== match.userId),
        { userId: match.userId, name: r.name ?? match.name, score: r.score, feedback: r.feedback },
      ]);
    }
  }

  function updateResult(userId: string, field: "score" | "feedback", value: string | number) {
    setResults((prev) =>
      prev.map((r) => r.userId === userId ? { ...r, [field]: value } : r),
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
    const toPost = results.filter((r) => !r.error);
    if (toPost.length === 0) { toast.error("No valid results to post"); return; }
    setPosting(true);
    try {
      const res = await fetch("/api/actions/grade-tugas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          assignId,
          grades: toPost.map((r) => ({ userId: r.userId, score: r.score, feedback: r.feedback })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const statuses: Record<string, "ok" | "skipped" | "error"> = {};
      for (const r of json.results ?? []) statuses[r.userId] = r.status;
      setPostStatuses(statuses);

      const { ok, skipped, errors } = json.summary ?? {};
      toast.success(`Posted: ${ok} graded, ${skipped} skipped, ${errors} errors`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPosting(false);
    }
  }

  const ungraded = submissions.filter((s) => !s.finalGrade && !s.grade).length;
  const withFiles = submissions.filter((s) => s.files.some((f) => f.localPath));
  const selectedWithFiles = withFiles.filter((s) => selected.has(s.userId));
  const allSelected = submissions.length > 0 && selected.size === submissions.length;

  // Result for the student whose file is open in sidebar
  const sidebarResult = viewingFile ? results.find((r) => r.userId === viewingFile.userId) : null;

  return (
    <div className="flex gap-4 items-start">
    <div className="flex-1 min-w-0 space-y-4">

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={collect} disabled={collecting || deleting}>
          {collecting ? "Collecting..." : submissions.length > 0 ? "Re-collect" : "Collect submissions"}
        </Button>
        {submissions.length > 0 && (
          <>
            <Button
              variant="outline"
              onClick={deleteAndRescrape}
              disabled={collecting || deleting}
            >
              {deleting && !collecting ? "Deleting..." : "Delete & Rescrape"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteAll}
              disabled={collecting || deleting}
            >
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

      {/* ── AI Evaluation ── */}
      {submissions.length > 0 && (
        <Section title={`AI Evaluation${results.length > 0 ? ` (${results.length} results)` : ""}`}>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => evaluate(Array.from(selected))}
              disabled={evaluating || !skillId || selectedWithFiles.length === 0}
            >
              {evaluating
                ? "Evaluating..."
                : `Evaluate selected (${selectedWithFiles.length})`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowExport(true)} disabled={selected.size === 0}>
              Export / Import ({selected.size})
            </Button>
            {selected.size === 0 && (
              <span className="text-xs text-muted-foreground">Select at least one submission.</span>
            )}
            {selected.size > 0 && selectedWithFiles.length === 0 && (
              <span className="text-xs text-muted-foreground">Selected students have no downloaded files.</span>
            )}
          </div>

          {results.length > 0 && (
            <div className="space-y-2 mt-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <p className="text-xs text-muted-foreground">
                  {results.length} result{results.length !== 1 ? "s" : ""} — saved locally
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={postGrades}
                    disabled={posting || evaluating || results.filter((r) => !r.error).length === 0}
                  >
                    {posting ? "Posting grades..." : `Post grades (${results.filter((r) => !r.error).length})`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearAllResults} className="text-xs h-7">
                    Clear all
                  </Button>
                </div>
              </div>
              {results.map((r) => (
                <div
                  key={r.userId}
                  className={`rounded-lg border p-3 space-y-2 ${r.error ? "border-destructive/50 bg-destructive/5" : "bg-muted/20"}`}
                >
                  {/* Header row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{r.name}</span>
                    {!r.error && (
                      <Input
                        type="number" min={0} max={totalMax}
                        value={r.score}
                        onChange={(e) => updateResult(r.userId, "score", Number(e.target.value))}
                        className={`w-16 h-6 text-center text-xs font-semibold rounded-full border-0 ${scoreColor(r.score)}`}
                      />
                    )}
                    {r.error && (
                      <span className="text-xs text-destructive">{r.error}</span>
                    )}
                    {postStatuses[r.userId] === "ok" && (
                      <Badge variant="default" className="text-xs">Posted</Badge>
                    )}
                    {postStatuses[r.userId] === "skipped" && (
                      <Badge variant="secondary" className="text-xs">Skipped</Badge>
                    )}
                    {postStatuses[r.userId] === "error" && (
                      <Badge variant="destructive" className="text-xs">Failed</Badge>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2"
                        onClick={() => evaluate([r.userId])}
                        disabled={evaluating}
                      >
                        {evaluating ? "..." : "Re-eval"}
                      </Button>
                      <button
                        onClick={() => clearResult(r.userId)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {/* Feedback */}
                  {!r.error && (
                    <Textarea
                      value={r.feedback}
                      onChange={(e) => updateResult(r.userId, "feedback", e.target.value)}
                      rows={3}
                      className="text-sm"
                      placeholder="Feedback..."
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

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
              {allSelected ? "Unselect all" : `Select all (${submissions.length})`}
            </label>
            <span className="text-xs text-muted-foreground">
              {selected.size} of {submissions.length} selected
            </span>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Last Graded</TableHead>
                  <TableHead>Feedback</TableHead>
                  <TableHead>Final Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.userId} className={selected.has(s.userId) ? "" : "opacity-50"}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(s.userId)}
                        onChange={() => toggleSelect(s.userId)}
                        className="cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      <div>{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
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
                                  className={`text-xs text-primary hover:underline truncate max-w-[180px] text-left ${viewingFile?.localPath === f.localPath ? "font-semibold underline" : ""}`}
                                  title="Click to view PDF"
                                >
                                  {f.filename}
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={f.filename}>
                                  {f.filename}
                                </span>
                              )}
                              {f.submittedAt && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  · {f.submittedAt}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{gradeBadge(s.grade)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {s.lastModifiedGrade || "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      {s.feedbackComment || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{gradeBadge(s.finalGrade)}</TableCell>
                  </TableRow>
                ))}
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
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{viewingFile.filename}</p>
            <p className="text-sm font-semibold truncate">{viewingFile.studentName}</p>
          </div>
          <button onClick={() => setViewingFile(null)} className="text-muted-foreground hover:text-foreground shrink-0 text-lg leading-none">✕</button>
        </div>

        {/* PDF viewer */}
        <iframe
          src={`/api/tugas/files?path=${encodeURIComponent(viewingFile.localPath)}`}
          className="flex-1 w-full rounded border bg-muted/20 min-h-0"
          title={viewingFile.filename}
        />

        {/* Score + Feedback editor */}
        <div className="space-y-2 shrink-0">
          {sidebarResult ? (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Score</label>
                <Input
                  type="number" min={0} max={totalMax}
                  value={sidebarResult.score}
                  onChange={(e) => updateResult(viewingFile.userId, "score", Number(e.target.value))}
                  className={`w-16 h-7 text-center text-xs font-semibold rounded-full border-0 ${scoreColor(sidebarResult.score)}`}
                />
                <span className="text-xs text-muted-foreground">/ {totalMax}</span>
              </div>
              <Textarea
                value={sidebarResult.feedback}
                onChange={(e) => updateResult(viewingFile.userId, "feedback", e.target.value)}
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
