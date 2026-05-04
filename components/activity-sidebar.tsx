"use client";

import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@/lib/activity-log";

const LEVEL_COLORS: Record<string, string> = {
  info: "text-muted-foreground",
  success: "text-green-600 dark:text-green-400",
  warn: "text-yellow-600 dark:text-yellow-400",
  error: "text-red-600 dark:text-red-400",
};

const LEVEL_DOT: Record<string, string> = {
  info: "bg-muted-foreground",
  success: "bg-green-500",
  warn: "bg-yellow-500",
  error: "bg-red-500",
};

function LogLine({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <div className="flex items-start gap-2 py-0.5 text-xs font-mono leading-relaxed">
      <span className="shrink-0 text-muted-foreground/60 tabular-nums">{time}</span>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[entry.level] ?? "bg-muted-foreground"}`} />
      <span className={`break-words ${LEVEL_COLORS[entry.level] ?? ""}`}>{entry.msg}</span>
    </div>
  );
}

export function ActivitySidebar() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/activity-log");

    es.onmessage = (e) => {
      try {
        const entry: LogEntry = JSON.parse(e.data);
        setEntries((prev) => [...prev.slice(-199), entry]);
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      // SSE auto-reconnects; no action needed
    };

    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <aside
      className={`fixed right-0 top-0 z-40 flex h-screen flex-col border-l bg-background transition-all duration-200 ${
        open ? "w-72" : "w-9"
      }`}
    >
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-center border-b px-2 text-xs text-muted-foreground hover:bg-accent"
        title={open ? "Collapse log" : "Expand log"}
      >
        {open ? (
          <span className="flex w-full items-center justify-between">
            <span className="font-semibold tracking-wide">Activity</span>
            <span>›</span>
          </span>
        ) : (
          <span className="rotate-180">›</span>
        )}
      </button>

      {open && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {entries.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {entries.map((e) => (
                <LogLine key={e.id} entry={e} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
          {entries.length > 0 && (
            <button
              onClick={() => setEntries([])}
              className="border-t px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
