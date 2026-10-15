"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { Discussion, Session } from "@/types";

export function CourseActions({
  credentialId,
  courseId,
  hasForumUrl,
  initialMateriPath,
  initialMateriAt,
  initialDiscussions,
  initialSessions,
}: {
  credentialId: string;
  courseId: string;
  courseUrl: string;
  hasForumUrl: boolean;
  initialMateriPath?: string;
  initialMateriAt?: string;
  initialDiscussions: Discussion[];
  initialSessions: Session[];
}) {
  const [discussions, setDiscussions] = useState<Discussion[]>(initialDiscussions);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [forumFound, setForumFound] = useState(hasForumUrl);
  const [findBusy, setFindBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [allDiskusiBusy, setAllDiskusiBusy] = useState(false);
  const [materiBusy, setMateriBusy] = useState(false);
  const [materiPath, setMateriPath] = useState(initialMateriPath);
  const [materiAt, setMateriAt] = useState(initialMateriAt);

  async function findForum() {
    setFindBusy(true);
    try {
      const res = await fetch("/api/actions/intro-forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setForumFound(true);
      toast.success("Forum Perkenalan found");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setFindBusy(false);
    }
  }

  async function refreshDiscussions() {
    setRefreshBusy(true);
    try {
      const res = await fetch("/api/actions/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      // Reload discussions from server via page refresh approach
      const listRes = await fetch(`/api/discussions?credentialId=${credentialId}&courseId=${courseId}`);
      if (listRes.ok) {
        const data = await listRes.json();
        setDiscussions(data.items);
      }

      const updated = json.results?.filter((r: { status: string }) => r.status === "updated").length ?? 0;
      const unchanged = json.results?.filter((r: { status: string }) => r.status === "unchanged").length ?? 0;
      toast.success(`Done: ${updated} updated, ${unchanged} unchanged`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRefreshBusy(false);
    }
  }

  async function collectSessions() {
    setSessionsBusy(true);
    try {
      const res = await fetch("/api/actions/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const listRes = await fetch(`/api/sessions?credentialId=${credentialId}&courseId=${courseId}`);
      if (listRes.ok) {
        const data = await listRes.json();
        setSessions(data.items);
      }
      toast.success(`Collected ${json.count} sessions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSessionsBusy(false);
    }
  }

  async function collectMaterial() {
    setMateriBusy(true);
    try {
      const res = await fetch("/api/actions/collect-material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      setMateriPath(json.outDir);
      setMateriAt(new Date().toISOString());
      if (json.failed > 0) {
        toast.warning(
          `${json.totalSections - json.failed}/${json.totalSections} sections collected (${json.failed} failed — see activity log), ${json.totalFiles} files`,
        );
      } else {
        toast.success(`${json.totalSections} sections, ${json.totalFiles} files → ${json.outDir}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setMateriBusy(false);
    }
  }

  async function refreshAllDiskusi() {
    setAllDiskusiBusy(true);
    try {
      const res = await fetch("/api/actions/course-diskusi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const updated = json.results?.reduce(
        (sum: number, r: { updated?: number }) => sum + (r.updated ?? 0),
        0,
      ) ?? 0;
      if (json.failed > 0) {
        toast.warning(
          `${json.total - json.failed}/${json.total} forums refreshed (${json.failed} failed — see activity log), ${updated} threads updated`,
        );
      } else {
        toast.success(`${json.total} forums refreshed, ${updated} threads updated`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setAllDiskusiBusy(false);
    }
  }

  const needsReply = discussions.filter((d) => !d.iReplied).length;
  const diskusiForumCount = new Set(
    sessions.flatMap((s) => s.diskusi).map((d) => d.url.match(/[?&]id=(\d+)/)?.[1]).filter(Boolean),
  ).size;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Find intro forum</CardTitle>
              {forumFound && <Badge variant="default">Found</Badge>}
            </div>
            <CardDescription>
              Locates Forum Perkenalan link on the course page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={findForum} disabled={findBusy} variant={forumFound ? "outline" : "default"}>
              {findBusy ? "Searching..." : forumFound ? "Re-find" : "Find forum"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Refresh discussions</CardTitle>
              {needsReply > 0 && (
                <Link href={`/credentials/${credentialId}/needs-reply`}>
                  <Badge variant="destructive" className="cursor-pointer hover:opacity-80">
                    {needsReply} need reply
                  </Badge>
                </Link>
              )}
              {discussions.length > 0 && needsReply === 0 && (
                <Badge variant="default">All replied</Badge>
              )}
            </div>
            <CardDescription>
              Scrapes discussion list + posts. Skips unchanged threads.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              onClick={refreshDiscussions}
              disabled={refreshBusy || !forumFound}
            >
              {refreshBusy ? "Refreshing..." : "Refresh"}
            </Button>
            {discussions.length > 0 && (
              <Link href={`/credentials/${credentialId}/courses/${courseId}/perkenalan`}>
                <Button variant="outline">Open threads</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Score monitor</CardTitle>
            <CardDescription>
              Compares gradebook scores with collected Diskusi and Tugas activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/credentials/${credentialId}/courses/${courseId}/scores`}>
              <Button variant="outline">Open scores</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sessions</CardTitle>
            {sessions.length > 0 && (
              <Badge variant="secondary">{sessions.length} sessions</Badge>
            )}
          </div>
          <CardDescription>
            Scrapes all session tabs and finds Diskusi forums in each.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={collectSessions} disabled={sessionsBusy}>
            {sessionsBusy ? "Collecting..." : sessions.length > 0 ? "Refresh" : "Collect sessions"}
          </Button>
          {diskusiForumCount > 0 && (
            <Button onClick={refreshAllDiskusi} disabled={allDiskusiBusy} variant="outline">
              {allDiskusiBusy
                ? "Refreshing all diskusi..."
                : `Refresh all diskusi (${diskusiForumCount})`}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Deep collect material</CardTitle>
            {materiAt && (
              <Badge variant="secondary">
                {new Date(materiAt).toLocaleDateString()}
              </Badge>
            )}
          </div>
          <CardDescription>
            Walks every session tab and writes the instruction as Markdown plus all attached
            files into per-session folders, ready to hand to a local agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={collectMaterial} disabled={materiBusy}>
              {materiBusy
                ? "Collecting... (watch Activity log)"
                : materiPath
                  ? "Re-collect"
                  : "Collect material"}
            </Button>
            {materiPath && (
              <Link href={`/credentials/${credentialId}/courses/${courseId}/materi`}>
                <Button variant="outline">View material</Button>
              </Link>
            )}
          </div>
          {materiPath && (
            <p className="text-xs text-muted-foreground">
              Output:{" "}
              <code className="select-all rounded bg-muted px-1 py-0.5">{materiPath}</code>
            </p>
          )}
        </CardContent>
      </Card>

      {sessions.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Sessions ({sessions.length})</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Diskusi</TableHead>
                <TableHead>Tugas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {s.name}
                    </a>
                  </TableCell>
                  <TableCell>
                    {s.diskusi.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.diskusi.map((d) => {
                          const forumId = d.url.match(/[?&]id=(\d+)/)?.[1];
                          return forumId ? (
                            <Link
                              key={d.url}
                              href={`/credentials/${credentialId}/courses/${courseId}/diskusi/${forumId}`}
                              className="text-xs underline text-muted-foreground hover:text-foreground"
                            >
                              {d.name}
                            </Link>
                          ) : (
                            <a
                              key={d.url}
                              href={d.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs underline text-muted-foreground hover:text-foreground"
                            >
                              {d.name}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.tugas.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.tugas.map((t) => {
                          const assignId = t.url.match(/[?&]id=(\d+)/)?.[1];
                          return assignId ? (
                            <Link
                              key={t.url}
                              href={`/credentials/${credentialId}/courses/${courseId}/tugas/${assignId}`}
                              className="text-xs underline text-muted-foreground hover:text-foreground"
                            >
                              {t.name}
                            </Link>
                          ) : (
                            <a
                              key={t.url}
                              href={t.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs underline text-muted-foreground hover:text-foreground"
                            >
                              {t.name}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {discussions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Discussions ({discussions.length})
            </h2>
            <Link href={`/credentials/${credentialId}/courses/${courseId}/perkenalan`}>
              <Button size="sm" variant="outline">Batch reply</Button>
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Started by</TableHead>
                <TableHead>Last post</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Replies</TableHead>
                <TableHead className="text-center">Replied?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discussions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/credentials/${credentialId}/courses/${courseId}/discussions/${d.id}`}
                        className="hover:underline"
                      >
                        {d.title}
                      </Link>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        title="Open on UT"
                      >
                        ↗
                      </a>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{d.startedBy}</TableCell>
                  <TableCell className="text-sm">{d.lastPostBy}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {d.lastPostDate
                      ? new Date(d.lastPostDate).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center">{d.repliesCount}</TableCell>
                  <TableCell className="text-center">
                    {d.iReplied ? (
                      <Badge variant="default">Yes</Badge>
                    ) : (
                      <Badge variant="destructive">No</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {discussions.length === 0 && forumFound && (
        <p className="text-sm text-muted-foreground">No discussions yet. Click Refresh.</p>
      )}
      {!forumFound && (
        <p className="text-sm text-muted-foreground">Find the forum first, then refresh.</p>
      )}
    </div>
  );
}
