"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CollectedSessionOnDisk } from "@/lib/materi";
import type { MaterialActivity } from "@/types";

function fileHref(relDir: string, localPath: string) {
  return `/api/materi/file?path=${encodeURIComponent(`${relDir}/${localPath}`)}`;
}

function Html({ html }: { html: string }) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none [&_iframe]:max-w-full [&_img]:max-w-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ActivityBlock({ a }: { a: MaterialActivity }) {
  switch (a.kind) {
    case "text":
      return <Html html={a.html} />;

    case "assign":
      return (
        <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50/50 p-3 dark:bg-amber-950/20">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Tugas</Badge>
            <span className="font-semibold">{a.name}</span>
            {a.dueDate && (
              <span className="text-xs text-muted-foreground">Batas: {a.dueDate}</span>
            )}
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ↗
            </a>
          </div>
          <Html html={a.html} />
        </div>
      );

    case "forum":
      return (
        <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50/50 p-3 dark:bg-blue-950/20">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Forum</Badge>
            <span className="font-semibold">{a.name}</span>
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ↗
            </a>
          </div>
          <Html html={a.html} />
        </div>
      );

    case "webinar":
      return (
        <div className="rounded-lg border-l-4 border-violet-400 bg-violet-50/50 p-3 text-sm dark:bg-violet-950/20">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Webinar</Badge>
            <span className="font-semibold">{a.name}</span>
          </div>
          {a.start && (
            <p className="text-muted-foreground">
              {a.start}
              {a.end ? ` – ${a.end}` : ""}
              {a.timezone ? ` (${a.timezone})` : ""}
            </p>
          )}
          {a.joinUrl && (
            <a
              href={a.joinUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-primary hover:underline"
            >
              Join Teams meeting ↗
            </a>
          )}
        </div>
      );

    default:
      return null;
  }
}

function SessionCard({
  s,
  defaultOpen,
}: {
  s: CollectedSessionOnDisk;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const files = s.activities.filter((a) => a.kind === "file");
  const links = s.activities.filter((a) => a.kind === "link");
  const body = s.activities.filter(
    (a) => a.kind === "text" || a.kind === "assign" || a.kind === "forum" || a.kind === "webinar",
  );

  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"
      >
        <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
        <span className="font-semibold">{s.name}</span>
        {files.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {files.length} berkas
          </Badge>
        )}
        {s.activities.some((a) => a.kind === "assign") && (
          <Badge variant="secondary" className="text-xs">Tugas</Badge>
        )}
        {s.activities.some((a) => a.kind === "forum") && (
          <Badge variant="secondary" className="text-xs">Forum</Badge>
        )}
        {s.activities.some((a) => a.kind === "webinar") && (
          <Badge variant="secondary" className="text-xs">Webinar</Badge>
        )}
        {s.error && (
          <Badge variant="destructive" className="text-xs">Error</Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{s.dirName}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          <div className="flex flex-wrap gap-2">
            <a href={s.url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">Buka di UT ↗</Button>
            </a>
            <a
              href={`/api/materi/file?path=${encodeURIComponent(`${s.relDir}/instruction.md`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button size="sm" variant="ghost">instruction.md</Button>
            </a>
          </div>

          {s.summaryHtml && <Html html={s.summaryHtml} />}

          {body.map((a, i) => (
            <ActivityBlock key={i} a={a} />
          ))}

          {files.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Bahan ({files.length})
              </h3>
              <ul className="space-y-1">
                {files.map(
                  (a) =>
                    a.kind === "file" && (
                      <li key={a.localPath} className="text-sm">
                        <a
                          href={fileHref(s.relDir, a.localPath)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {a.filename}
                        </a>
                        {a.name && a.name !== a.filename.replace(/\.[^.]+$/, "") && (
                          <span className="ml-2 text-xs text-muted-foreground">({a.name})</span>
                        )}
                      </li>
                    ),
                )}
              </ul>
            </div>
          )}

          {links.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Tautan ({links.length})
              </h3>
              <ul className="space-y-1">
                {links.map(
                  (a, i) =>
                    a.kind === "link" && (
                      <li key={i} className="text-sm">
                        <a
                          href={a.target || a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-primary hover:underline"
                        >
                          {a.name}
                        </a>
                      </li>
                    ),
                )}
              </ul>
            </div>
          )}

          {s.error && (
            <p className="text-sm text-destructive">Gagal sebagian: {s.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function MateriView({ sessions }: { sessions: CollectedSessionOnDisk[] }) {
  const [allOpen, setAllOpen] = useState(false);

  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" onClick={() => setAllOpen((v) => !v)}>
        {allOpen ? "Tutup semua" : "Buka semua"}
      </Button>

      <div className="space-y-2">
        {sessions.map((s) => (
          <SessionCard key={`${s.dirName}-${allOpen}`} s={s} defaultOpen={allOpen} />
        ))}
      </div>
    </div>
  );
}
