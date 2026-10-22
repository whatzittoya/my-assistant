// In-memory background jobs for MCP tools that outlive a client's tool-call
// timeout (scrapes and posts run up to 10 minutes).
//
// A tool called with `background: true` returns a jobId immediately; the agent
// polls get_job. Jobs live in process memory (globalThis, so they survive dev
// HMR) and are lost on server restart — results that matter are already
// persisted to Firestore by the underlying action.

import { randomUUID } from "crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type Job = {
  id: string;
  tool: string;
  args: unknown;
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
  result?: CallToolResult;
};

const MAX_JOBS = 100;

const store = globalThis as unknown as { __mcpJobs?: Map<string, Job> };
const jobs = (store.__mcpJobs ??= new Map());

export function startJob(tool: string, args: unknown, run: () => Promise<CallToolResult>): Job {
  const job: Job = {
    id: randomUUID(),
    tool,
    args,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);

  // Evict the oldest finished jobs once over the cap (Map keeps insertion order).
  for (const [id, j] of jobs) {
    if (jobs.size <= MAX_JOBS) break;
    if (j.status !== "running") jobs.delete(id);
  }

  run()
    .then((result) => {
      job.status = result.isError ? "error" : "done";
      job.result = result;
    })
    .catch((err) => {
      job.status = "error";
      job.result = {
        content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
    });

  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(): Job[] {
  return [...jobs.values()].reverse();
}
