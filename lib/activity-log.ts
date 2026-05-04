import { EventEmitter } from "node:events";

export type LogLevel = "info" | "success" | "error" | "warn";

export type LogEntry = {
  id: string;
  ts: string; // ISO
  level: LogLevel;
  msg: string;
};

// Module-level emitter + ring buffer (persists across requests in same process)
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

const BUFFER_SIZE = 200;
const buffer: LogEntry[] = [];
let counter = 0;

export function log(level: LogLevel, msg: string): void {
  const entry: LogEntry = {
    id: String(++counter),
    ts: new Date().toISOString(),
    level,
    msg,
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  emitter.emit("entry", entry);
}

export const logger = {
  info: (msg: string) => log("info", msg),
  ok: (msg: string) => log("success", msg),
  warn: (msg: string) => log("warn", msg),
  err: (msg: string) => log("error", msg),
};

/** Get last N entries (for new SSE connections to catch up) */
export function recentLogs(n = 50): LogEntry[] {
  return buffer.slice(-n);
}

/** Subscribe — calls cb on each new entry, returns unsubscribe fn */
export function subscribe(cb: (e: LogEntry) => void): () => void {
  emitter.on("entry", cb);
  return () => emitter.off("entry", cb);
}
