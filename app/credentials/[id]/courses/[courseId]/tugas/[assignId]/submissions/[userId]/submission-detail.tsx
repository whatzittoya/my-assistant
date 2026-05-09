"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type {
  TugasSubmission,
  TugasMeta,
  CriteriaScore,
  SubmissionAiEval,
  SubmissionFinalEval,
} from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColorPct(score: number, max: number) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 80) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (pct >= 60) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

function ScoreBadge({ score, max }: { score: number; max: number }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${scoreColorPct(score, max)}`}>
      {score}/{max}
    </span>
  );
}

// ── AI Eval panel (read-only) ─────────────────────────────────────────────────

function AiEvalPanel({ eval: aiEval, totalMax }: { eval: SubmissionAiEval; totalMax: number }) {
  return (
    <div className="space-y-3 rounded-lg border p-4 bg-muted/10">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">AI Recommendation</p>
        <ScoreBadge score={aiEval.totalScore} max={totalMax} />
      </div>

      {aiEval.criteriaScores.length > 0 && (
        <div className="rounded border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-1.5 text-left font-medium">Criteria</th>
                <th className="px-3 py-1.5 text-center font-medium w-24">Score</th>
                <th className="px-3 py-1.5 text-center font-medium w-16">Max</th>
              </tr>
            </thead>
            <tbody>
              {aiEval.criteriaScores.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{c.criteria}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreColorPct(c.score, c.maxScore)}`}>
                      {c.score}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center text-muted-foreground">{c.maxScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aiEval.reasoning && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Reasoning</p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/20 rounded p-2">
            {aiEval.reasoning}
          </p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">AI Feedback</p>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{aiEval.feedback || "—"}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Generated: {new Date(aiEval.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

// ── Final Eval editor ─────────────────────────────────────────────────────────

function FinalEvalEditor({
  submission,
  aiEval,
  initialFinalEval,
  pedomanItems,
  totalMax,
  assignId,
  credentialId,
  courseId,
  onSaved,
}: {
  submission: TugasSubmission;
  aiEval: SubmissionAiEval | undefined;
  initialFinalEval: SubmissionFinalEval | undefined;
  pedomanItems: TugasMeta["pedomanItems"];
  totalMax: number;
  assignId: string;
  credentialId: string;
  courseId: string;
  onSaved: (finalEval: SubmissionFinalEval) => void;
}) {
  // Seed from: finalEval → aiEval → pedoman structure with zeros
  const seedCriteria = (): CriteriaScore[] => {
    if (initialFinalEval?.criteriaScores.length) return initialFinalEval.criteriaScores;
    if (aiEval?.criteriaScores.length) return aiEval.criteriaScores.map((c) => ({ ...c }));
    if (pedomanItems.length) return pedomanItems.map((p) => ({ id: p.id, criteria: p.criteria, score: 0, maxScore: p.maxScore }));
    return [];
  };

  const [criteria, setCriteria] = useState<CriteriaScore[]>(seedCriteria);
  const [feedback, setFeedback] = useState(initialFinalEval?.feedback ?? aiEval?.feedback ?? "");
  const [saving, setSaving] = useState(false);

  const totalScore = criteria.reduce((s, c) => s + c.score, 0);

  function updateScore(i: number, score: number) {
    setCriteria((prev) => prev.map((c, idx) => idx === i ? { ...c, score } : c));
  }

  async function save() {
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
            criteriaScores: criteria,
            feedback,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const now = new Date().toISOString();
      onSaved({ criteriaScores: criteria, totalScore, feedback, savedAt: now });
      toast.success("Final eval saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Final Evaluation</p>
        <ScoreBadge score={totalScore} max={totalMax} />
      </div>

      {criteria.length > 0 && (
        <div className="rounded border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-1.5 text-left font-medium">Criteria</th>
                <th className="px-3 py-1.5 text-center font-medium w-28">Score (final)</th>
                <th className="px-3 py-1.5 text-center font-medium w-16">Max</th>
                {aiEval?.criteriaScores.length ? (
                  <th className="px-3 py-1.5 text-center font-medium w-20 text-muted-foreground">AI</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {criteria.map((c, i) => {
                const aiCs = aiEval?.criteriaScores.find((a) => a.criteria === c.criteria);
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{c.criteria}</td>
                    <td className="px-3 py-1.5 text-center">
                      <Input
                        type="number"
                        min={0}
                        max={c.maxScore}
                        value={c.score}
                        onChange={(e) => updateScore(i, Number(e.target.value))}
                        className={`w-16 h-7 text-center text-xs font-semibold rounded-full border-0 mx-auto ${scoreColorPct(c.score, c.maxScore)}`}
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
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColorPct(totalScore, totalMax)}`}>
                    {totalScore}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center text-muted-foreground">{totalMax}</td>
                {aiEval?.criteriaScores.length ? (
                  <td className="px-3 py-1.5 text-center text-muted-foreground">{aiEval.totalScore}</td>
                ) : null}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {criteria.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">No criteria defined. Set up Pedoman Penilaian first.</p>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium">Total Score</label>
            <Input
              type="number"
              min={0}
              max={totalMax}
              value={criteria.length === 0 ? (initialFinalEval?.totalScore ?? aiEval?.totalScore ?? 0) : totalScore}
              onChange={(e) => {
                const score = Number(e.target.value);
                setCriteria([{ id: "total", criteria: "Total", score, maxScore: totalMax }]);
              }}
              className="w-20 text-sm"
            />
            <span className="text-xs text-muted-foreground">/ {totalMax}</span>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Feedback Comment (sent to student)</label>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={5}
          className="text-sm"
          placeholder="Feedback to student..."
        />
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save final eval"}
      </Button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SubmissionDetail({
  submission: initialSubmission,
  meta,
  credentialId,
  courseId,
  assignId,
  allSubmissions,
  onReEvaluate,
}: {
  submission: TugasSubmission;
  meta: TugasMeta;
  credentialId: string;
  courseId: string;
  assignId: string;
  allSubmissions?: { userId: string; name: string }[];
  onReEvaluate?: () => void;
}) {
  const router = useRouter();
  const [submission, setSubmission] = useState(initialSubmission);
  const [activeFile, setActiveFile] = useState(
    initialSubmission.files.find((f) => f.localPath) ?? null,
  );

  const totalMax = meta.pedomanItems.reduce((s, p) => s + p.maxScore, 0) || 100;

  function handleFinalSaved(finalEval: SubmissionFinalEval) {
    setSubmission((prev) => ({ ...prev, finalEval }));
  }

  const hasFinalEval = !!submission.finalEval;
  const hasAiEval = !!submission.aiEval;

  const baseUrl = `/credentials/${credentialId}/courses/${courseId}/tugas/${assignId}/submissions`;
  const currentIdx = allSubmissions?.findIndex((s) => s.userId === submission.userId) ?? -1;
  const prevStudent = currentIdx > 0 ? allSubmissions![currentIdx - 1] : null;
  const nextStudent = currentIdx >= 0 && currentIdx < (allSubmissions?.length ?? 0) - 1
    ? allSubmissions![currentIdx + 1]
    : null;

  function navigateTo(userId: string) {
    router.push(`${baseUrl}/${userId}`);
  }

  return (
    <div className="space-y-3">
    {allSubmissions && allSubmissions.length > 1 && (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!prevStudent}
          onClick={() => prevStudent && navigateTo(prevStudent.userId)}
        >
          ← Prev
        </Button>
        <Select value={submission.userId} onValueChange={navigateTo}>
          <SelectTrigger className="w-56 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allSubmissions.map((s) => (
              <SelectItem key={s.userId} value={s.userId}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {currentIdx + 1} / {allSubmissions.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!nextStudent}
          onClick={() => nextStudent && navigateTo(nextStudent.userId)}
        >
          Next →
        </Button>
      </div>
    )}
    <div className="flex gap-4 items-start h-[calc(100vh-200px)]">
      {/* ── PDF viewer ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-2 h-full">
        {submission.files.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {submission.files.map((f, i) => (
              <button
                key={i}
                onClick={() => setActiveFile(f)}
                className={`text-xs px-2 py-1 rounded border truncate max-w-[200px] ${
                  activeFile?.localPath === f.localPath
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title={f.filename}
              >
                {f.filename}
              </button>
            ))}
          </div>
        )}
        {activeFile?.localPath ? (
          <iframe
            src={`/api/tugas/files?path=${encodeURIComponent(activeFile.localPath)}`}
            className="flex-1 w-full rounded-lg border bg-muted/20"
            title={activeFile.filename}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center rounded-lg border bg-muted/10 text-muted-foreground text-sm">
            {submission.files.length === 0
              ? "No files submitted"
              : "No downloaded files — run Collect to download"}
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="w-[400px] shrink-0 overflow-y-auto space-y-4 h-full pr-1">
        {/* Student info */}
        <div className="space-y-1">
          <p className="text-lg font-semibold">{submission.name}</p>
          <p className="text-sm text-muted-foreground">{submission.email}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="text-xs">{submission.status}</Badge>
            {hasFinalEval && (
              <Badge variant="default" className="text-xs">Final: {submission.finalEval!.totalScore}/{totalMax}</Badge>
            )}
            {hasAiEval && !hasFinalEval && (
              <Badge variant="secondary" className="text-xs">AI: {submission.aiEval!.totalScore}/{totalMax}</Badge>
            )}
            {submission.grade && (
              <Badge variant="outline" className="text-xs">LMS grade: {submission.grade}</Badge>
            )}
          </div>
        </div>

        {/* AI Eval (read-only) */}
        {submission.aiEval ? (
          <AiEvalPanel eval={submission.aiEval} totalMax={totalMax} />
        ) : (
          <div className="rounded-lg border p-4 bg-muted/10 space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">No AI Evaluation yet</p>
            <p className="text-xs text-muted-foreground">
              Go back to the tugas list and run AI evaluation for this student.
            </p>
          </div>
        )}

        {/* Final Eval (editable) */}
        <FinalEvalEditor
          submission={submission}
          aiEval={submission.aiEval}
          initialFinalEval={submission.finalEval}
          pedomanItems={meta.pedomanItems}
          totalMax={totalMax}
          assignId={assignId}
          credentialId={credentialId}
          courseId={courseId}
          onSaved={handleFinalSaved}
        />
      </div>
    </div>
    </div>
  );
}
