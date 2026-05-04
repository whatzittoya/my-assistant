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
import type { Discussion } from "@/types";

export function DiskusiActions({
  credentialId,
  courseId,
  forumId,
  forumName,
  initialDiscussions,
}: {
  credentialId: string;
  courseId: string;
  forumId: string;
  forumName: string;
  initialDiscussions: Discussion[];
}) {
  const [discussions, setDiscussions] = useState<Discussion[]>(initialDiscussions);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch("/api/actions/session-diskusi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, forumId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");

      const listRes = await fetch(
        `/api/session-diskusi?credentialId=${credentialId}&courseId=${courseId}&forumId=${forumId}`,
      );
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
      setBusy(false);
    }
  }

  const needsReply = discussions.filter((d) => !d.iReplied).length;
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteDiscussion(discId: string, title: string) {
    if (
      !confirm(
        `Delete "${title}" and its posts from the database? Re-run Refresh to re-scrape. UT forum is not affected.`,
      )
    ) return;
    setDeletingId(discId);
    try {
      const qs = new URLSearchParams({ credentialId, courseId });
      const res = await fetch(
        `/api/session-diskusi/${forumId}/${discId}?${qs.toString()}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setDiscussions((prev) => prev.filter((d) => d.id !== discId));
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Refresh {forumName}</CardTitle>
            {needsReply > 0 && (
              <Badge variant="destructive">{needsReply} need reply</Badge>
            )}
            {discussions.length > 0 && needsReply === 0 && (
              <Badge variant="default">All replied</Badge>
            )}
          </div>
          <CardDescription>
            Scrapes student discussion threads and checks for your replies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refresh} disabled={busy}>
            {busy ? "Refreshing..." : discussions.length > 0 ? "Refresh" : "Collect"}
          </Button>
        </CardContent>
      </Card>

      {discussions.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Last post by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-center">Replies</TableHead>
              <TableHead className="text-center">Replied?</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {discussions.map((d) => (
              <TableRow key={d.id} className={!d.iReplied ? "bg-destructive/5" : ""}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/credentials/${credentialId}/courses/${courseId}/diskusi/${forumId}/${d.id}`}
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
                <TableCell className="text-sm">{d.lastPostBy}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {d.lastPostDate ? new Date(d.lastPostDate).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-center">{d.repliesCount}</TableCell>
                <TableCell className="text-center">
                  {d.iReplied ? (
                    <Badge variant="default">Yes</Badge>
                  ) : (
                    <Badge variant="destructive">No</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteDiscussion(d.id, d.title)}
                    disabled={deletingId === d.id}
                  >
                    {deletingId === d.id ? "Deleting..." : "Delete"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {discussions.length === 0 && (
        <p className="text-sm text-muted-foreground">No discussions yet. Click Collect.</p>
      )}
    </div>
  );
}
