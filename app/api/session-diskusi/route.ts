import { NextRequest, NextResponse } from "next/server";
import { listSessionDiscussions } from "@/lib/session-diskusi";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");
  const forumId = searchParams.get("forumId");

  if (!credentialId || !courseId || !forumId) {
    return NextResponse.json(
      { error: "credentialId, courseId, forumId required" },
      { status: 400 },
    );
  }

  const items = await listSessionDiscussions(credentialId, courseId, forumId);
  return NextResponse.json({ items });
}
