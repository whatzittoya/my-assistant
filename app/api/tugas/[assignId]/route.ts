import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { listTugasSubmissions, deleteTugasSubmissions } from "@/lib/tugas";

export const dynamic = "force-dynamic";

const FILES_BASE = path.join(process.cwd(), ".tugas-files");

export async function GET(
  req: Request,
  { params }: { params: Promise<{ assignId: string }> },
) {
  const { assignId } = await params;
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");

  if (!credentialId || !courseId) {
    return NextResponse.json({ error: "credentialId and courseId required" }, { status: 400 });
  }

  try {
    const items = await listTugasSubmissions(credentialId, courseId, assignId);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ assignId: string }> },
) {
  const { assignId } = await params;
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");

  if (!credentialId || !courseId)
    return NextResponse.json({ error: "credentialId and courseId required" }, { status: 400 });

  try {
    const count = await deleteTugasSubmissions(credentialId, courseId, assignId);

    // Delete local files
    const filesDir = path.join(FILES_BASE, credentialId, assignId);
    if (fs.existsSync(filesDir)) {
      fs.rmSync(filesDir, { recursive: true, force: true });
    }

    return NextResponse.json({ ok: true, deleted: count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
