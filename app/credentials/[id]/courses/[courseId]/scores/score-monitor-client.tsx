"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GradebookItem, GradebookSnapshot, ScoreMonitorRow, ScoreMonitorSummary } from "@/types";

type Monitor = {
  snapshot: GradebookSnapshot;
  rows: ScoreMonitorRow[];
  summary: ScoreMonitorSummary;
};

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "Never";
  return date.toLocaleString();
}

function scoreLabel(value: string | null) {
  return value ?? "-";
}

function itemHref(credentialId: string, courseId: string, item: GradebookItem) {
  if (item.kind === "diskusi") {
    return `/credentials/${credentialId}/courses/${courseId}/diskusi/${item.activityId}`;
  }
  return `/credentials/${credentialId}/courses/${courseId}/tugas/${item.activityId}`;
}

function shortItemName(name: string) {
  return name
    .replace(/\s+rating$/i, "")
    .replace(/^Diskusi\s+/i, "D")
    .replace(/^Tugas\s+/i, "T");
}

export function ScoreMonitorClient({
  credentialId,
  courseId,
  initialMonitor,
}: {
  credentialId: string;
  courseId: string;
  initialMonitor: Monitor;
}) {
  const [monitor, setMonitor] = useState(initialMonitor);
  const [showAll, setShowAll] = useState(false);
  const [refreshingGradebook, setRefreshingGradebook] = useState(false);
  const [refreshingActivity, setRefreshingActivity] = useState<string | null>(null);

  const rowsByStudent = useMemo(() => {
    const grouped = new Map<string, { student: ScoreMonitorRow["student"]; rows: Map<string, ScoreMonitorRow> }>();
    for (const row of monitor.rows) {
      const key = row.student.uid || row.student.email || row.student.name;
      const group = grouped.get(key) ?? { student: row.student, rows: new Map<string, ScoreMonitorRow>() };
      group.rows.set(row.item.itemId, row);
      grouped.set(key, group);
    }

    return Array.from(grouped.values())
      .filter((group) => showAll || Array.from(group.rows.values()).some((row) => row.missingScore))
      .sort((a, b) => a.student.name.localeCompare(b.student.name, undefined, { sensitivity: "base" }));
  }, [monitor.rows, showAll]);

  async function reloadMonitor() {
    const qs = new URLSearchParams({ credentialId, courseId });
    const res = await fetch(`/api/gradebook?${qs.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load monitor");
    setMonitor(json);
  }

  async function refreshGradebook() {
    setRefreshingGradebook(true);
    try {
      const res = await fetch("/api/actions/gradebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to refresh gradebook");
      await reloadMonitor();
      toast.success(`Gradebook refreshed: ${json.itemCount} items, ${json.studentCount} students`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRefreshingGradebook(false);
    }
  }

  async function refreshActivity(item: GradebookItem) {
    setRefreshingActivity(item.itemId);
    try {
      const endpoint = item.kind === "diskusi" ? "/api/actions/session-diskusi" : "/api/actions/tugas";
      const body =
        item.kind === "diskusi"
          ? { credentialId, courseId, forumId: item.activityId }
          : { credentialId, courseId, assignId: item.activityId, downloadFiles: false, collectScope: "all" };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to refresh activity");
      await reloadMonitor();
      toast.success(`${item.name} refreshed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRefreshingActivity(null);
    }
  }

  const hasSnapshot = monitor.snapshot.items.length > 0 || monitor.snapshot.students.length > 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Missing scores</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <AlertCircle className="size-4 text-destructive" />
            <span className="text-xl font-semibold">{monitor.summary.missingScores}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Diskusi</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xl font-semibold">{monitor.summary.missingDiskusi}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Tugas</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xl font-semibold">{monitor.summary.missingTugas}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Gradebook</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {prettyDate(monitor.snapshot.collectedAt)}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={refreshGradebook} disabled={refreshingGradebook}>
          <RefreshCw className={refreshingGradebook ? "animate-spin" : ""} />
          {refreshingGradebook ? "Refreshing..." : "Refresh gradebook"}
        </Button>
        <Button variant="outline" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show students with missing scores" : "Show all students"}
        </Button>
        <a href={monitor.snapshot.sourceUrl} target="_blank" rel="noreferrer">
          <Button variant="ghost">
            <ExternalLink />
            Open UT gradebook
          </Button>
        </a>
      </div>

      {!hasSnapshot && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No gradebook snapshot yet. Click Refresh gradebook to collect Diskusi and Tugas scores.
          </CardContent>
        </Card>
      )}

      {hasSnapshot && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              Student scores ({rowsByStudent.length})
            </h2>
            <div className="flex flex-wrap gap-1">
              {monitor.snapshot.items.map((item) => (
                <Button
                  key={item.itemId}
                  variant="outline"
                  size="xs"
                  onClick={() => refreshActivity(item)}
                  disabled={refreshingActivity === item.itemId}
                  title={`Refresh ${item.name}`}
                >
                  <RefreshCw className={refreshingActivity === item.itemId ? "animate-spin" : ""} />
                  {shortItemName(item.name)}
                </Button>
              ))}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-56 bg-background">Student</TableHead>
                <TableHead>Email</TableHead>
                {monitor.snapshot.items.map((item) => (
                  <TableHead key={item.itemId} className="min-w-24 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Link
                        href={itemHref(credentialId, courseId, item)}
                        className="underline decoration-muted-foreground/40 underline-offset-2"
                        title={item.name}
                      >
                        {shortItemName(item.name)}
                      </Link>
                      <Badge variant={item.kind === "diskusi" ? "secondary" : "outline"} className="h-4 px-1 text-[10px]">
                        {item.kind}
                      </Badge>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsByStudent.map(({ student, rows }) => (
                <TableRow key={student.uid || student.email}>
                  <TableCell className="sticky left-0 z-10 bg-background">
                    <div className="font-medium">{student.name}</div>
                    <div className="text-xs text-muted-foreground">{student.studentNo ?? student.uid}</div>
                  </TableCell>
                  <TableCell className="text-sm">{student.email}</TableCell>
                  {monitor.snapshot.items.map((item) => {
                    const row = rows.get(item.itemId);
                    const badgeVariant = row?.missingScore
                      ? "destructive"
                      : row?.lmsGrade
                        ? "default"
                        : "outline";
                    const evidenceTitle = row?.evidence
                      ? `${row.evidence.detail}${row.evidence.hasTutorReply ? " - tutor replied" : ""}`
                      : "No local activity collected";
                    return (
                      <TableCell
                        key={item.itemId}
                        className={`text-center ${row?.missingScore ? "bg-destructive/5" : ""}`}
                        title={evidenceTitle}
                      >
                        {row?.evidence?.url ? (
                          <a
                            href={row.evidence.url}
                            target={row.evidence.url.startsWith("/") ? undefined : "_blank"}
                            rel={row.evidence.url.startsWith("/") ? undefined : "noreferrer"}
                            className="inline-flex"
                          >
                            <Badge variant={badgeVariant}>{scoreLabel(row?.lmsGrade ?? null)}</Badge>
                          </a>
                        ) : (
                          <Badge variant={badgeVariant}>{scoreLabel(row?.lmsGrade ?? null)}</Badge>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {rowsByStudent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={monitor.snapshot.items.length + 2} className="py-6 text-center text-sm text-muted-foreground">
                    No students to show.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {hasSnapshot && rowsByStudent.length === 0 && !showAll && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No missing scores found. Toggle Show all students to inspect every Diskusi and Tugas item.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
