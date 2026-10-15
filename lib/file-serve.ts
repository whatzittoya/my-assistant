import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const PREVIEWABLE = new Set([".pdf", ".png", ".jpg", ".jpeg", ".txt"]);

/**
 * Serves a file from a local cache directory, guarding against path traversal.
 * `localPath` is relative to `base` (e.g. what we store in Firestore).
 */
export function serveLocalFile(base: string, localPath: string | null): Response {
  if (!localPath) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  // Prevent directory traversal
  const resolved = path.resolve(base, localPath);
  if (!resolved.startsWith(base + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(resolved);
  const filename = path.basename(resolved);
  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";
  const disposition = PREVIEWABLE.has(ext)
    ? "inline"
    : `attachment; filename="${encodeURIComponent(filename)}"`;

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Content-Length": String(buffer.length),
    },
  });
}
