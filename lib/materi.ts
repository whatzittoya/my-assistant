import * as fs from "fs";
import * as path from "path";
import TurndownService from "turndown";
import type { CollectedCourse, CollectedSession, MaterialActivity } from "@/types";

export const MATERI_BASE = path.join(process.cwd(), ".materi");

/** Folder-safe: strips separators and control chars, collapses whitespace. */
export function sanitizeForFolder(s: string): string {
  return s
    .replace(/[\/\\:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function courseDir(semesterName: string, courseName: string): string {
  return path.join(
    MATERI_BASE,
    sanitizeForFolder(semesterName) || "Tanpa Semester",
    sanitizeForFolder(courseName) || "Tanpa Nama",
  );
}

/** "00 - AKTIVITAS BELAJAR 1" — zero-padded so the folders sort in course order. */
export function sessionDirName(section: string, sessionName: string): string {
  const num = /^\d+$/.test(section) ? section.padStart(2, "0") : section;
  return `${num} - ${sanitizeForFolder(sessionName)}`;
}

// ── Reading back what was collected ──────────────────────────────────────────

export type CollectedSessionOnDisk = CollectedSession & {
  /** Session folder relative to MATERI_BASE — the prefix for file links. */
  relDir: string;
};

/**
 * Reads the per-session manifest.json files written by the collector.
 * Returns [] when the course has never been collected.
 */
export function readCollectedSessions(courseDirAbs: string): CollectedSessionOnDisk[] {
  if (!fs.existsSync(courseDirAbs)) return [];

  const out: CollectedSessionOnDisk[] = [];
  for (const entry of fs.readdirSync(courseDirAbs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(courseDirAbs, entry.name, "manifest.json");
    if (!fs.existsSync(manifest)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(manifest, "utf8")) as CollectedSession;
      out.push({
        ...data,
        dirName: data.dirName || entry.name,
        relDir: path.relative(MATERI_BASE, path.join(courseDirAbs, entry.name)),
      });
    } catch {
      // A half-written manifest shouldn't hide the rest of the course.
    }
  }

  return out.sort((a, b) => a.dirName.localeCompare(b.dirName, undefined, { numeric: true }));
}

// ── HTML → Markdown ──────────────────────────────────────────────────────────

let _td: TurndownService | null = null;

function turndown(): TurndownService {
  if (_td) return _td;
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  // UT wraps everything in styled spans and divs — unwrap them, keep the text.
  td.addRule("unwrapSpans", {
    filter: ["span"],
    replacement: (content) => content,
  });
  td.remove(["style", "script"]);
  _td = td;
  return td;
}

export function htmlToMarkdown(html: string): string {
  if (!html?.trim()) return "";
  return turndown()
    .turndown(html)
    .replace(/ /g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Renderers ────────────────────────────────────────────────────────────────

function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

function renderActivity(a: MaterialActivity): string {
  switch (a.kind) {
    case "text":
      return htmlToMarkdown(a.html);
    case "file":
      return `- [${a.name}](${encodePath(a.localPath)})`;
    case "link":
      return `- ${a.name} → ${a.target || a.url}`;
    case "assign": {
      const body = htmlToMarkdown(a.html);
      const due = a.dueDate ? `\n- Batas waktu: ${a.dueDate}` : "";
      return `### Tugas: ${a.name}\n\n- ${a.url}${due}\n\n${body}`.trim();
    }
    case "forum": {
      const body = htmlToMarkdown(a.html);
      return `### Forum: ${a.name}\n\n- ${a.url}\n\n${body}`.trim();
    }
    case "webinar": {
      const lines = [`### Tutorial Webinar: ${a.name}`, ""];
      if (a.subject) lines.push(`- Subject: ${a.subject}`);
      if (a.start) lines.push(`- Mulai: ${a.start}${a.timezone ? ` (${a.timezone})` : ""}`);
      if (a.end) lines.push(`- Selesai: ${a.end}`);
      if (a.joinUrl) lines.push(`- Join: ${a.joinUrl}`);
      return lines.join("\n");
    }
    case "other":
      return `- ${a.name} (${a.mod}) → ${a.url}`;
  }
}

export function renderInstructionMd(
  session: CollectedSession,
  course: { courseName: string; collectedAt: string },
): string {
  const parts: string[] = [
    `# ${session.name}`,
    "",
    `<!-- ${course.courseName} · section ${session.section} · collected ${course.collectedAt.slice(0, 10)} -->`,
    "",
    `[Buka di UT](${session.url})`,
  ];

  const summary = htmlToMarkdown(session.summaryHtml);
  if (summary) parts.push("", summary);

  // Inline text, assignments, forums and webinars keep their page order.
  const inline = session.activities.filter(
    (a) => a.kind === "text" || a.kind === "assign" || a.kind === "forum" || a.kind === "webinar",
  );
  for (const a of inline) {
    const block = renderActivity(a);
    if (block) parts.push("", "---", "", block);
  }

  const files = session.activities.filter((a) => a.kind === "file");
  if (files.length > 0) {
    parts.push("", "## Bahan", "", ...files.map(renderActivity));
  }

  const links = session.activities.filter((a) => a.kind === "link");
  if (links.length > 0) {
    parts.push("", "## Tautan", "", ...links.map(renderActivity));
  }

  const others = session.activities.filter((a) => a.kind === "other");
  if (others.length > 0) {
    parts.push("", "## Lainnya", "", ...others.map(renderActivity));
  }

  if (session.error) parts.push("", `> Gagal dikumpulkan sebagian: ${session.error}`);

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function renderCourseReadme(course: CollectedCourse): string {
  const lines = [
    `# ${course.courseName}`,
    "",
    `- Semester: ${course.semesterName}`,
    `- Course ID: ${course.courseId}`,
    `- Sumber: ${course.courseUrl}`,
    `- Dikumpulkan: ${course.collectedAt}`,
    "",
    `## Sesi (${course.sessions.length})`,
    "",
  ];
  for (const s of course.sessions) {
    const files = s.activities.filter((a) => a.kind === "file").length;
    const flags = [
      files > 0 ? `${files} berkas` : null,
      s.activities.some((a) => a.kind === "assign") ? "tugas" : null,
      s.activities.some((a) => a.kind === "forum") ? "forum" : null,
      s.activities.some((a) => a.kind === "webinar") ? "webinar" : null,
      s.error ? `ERROR: ${s.error}` : null,
    ].filter(Boolean);
    lines.push(
      `- [${s.name}](${encodePath(s.dirName)}/instruction.md)` +
        (flags.length > 0 ? ` — ${flags.join(", ")}` : ""),
    );
  }
  return lines.join("\n") + "\n";
}
