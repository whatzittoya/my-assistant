import { NextRequest, NextResponse } from "next/server";
import { deleteSessionDiscussion } from "@/lib/session-diskusi";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ forumId: string; discId: string }> },
) {
  const { forumId, discId } = await params;
  const { searchParams } = req.nextUrl;
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");

  if (!credentialId || !courseId) {
    return NextResponse.json(
      { error: "credentialId and courseId required" },
      { status: 400 },
    );
  }

  try {
    await deleteSessionDiscussion(credentialId, courseId, forumId, discId);
    logger.ok(`Deleted discussion ${discId} (forum ${forumId})`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.err(err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
