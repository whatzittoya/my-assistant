import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILES_BASE = path.join(process.cwd(), ".tugas-files");

/** Opens a downloaded tugas folder (relative to .tugas-files) in the OS file manager. */
export async function POST(req: Request) {
  const { path: rel } = (await req.json()) as { path?: string };
  if (!rel) return NextResponse.json({ error: "path required" }, { status: 400 });

  // localPath is stored with the OS separator (backslashes on Windows).
  let resolved = path.resolve(FILES_BASE, rel.replace(/[\\/]/g, path.sep));
  if (!resolved.startsWith(FILES_BASE + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  if (!fs.statSync(resolved).isDirectory()) resolved = path.dirname(resolved);

  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [resolved], { detached: true, stdio: "ignore" }).unref();
  return NextResponse.json({ ok: true });
}
