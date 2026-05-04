import { NextResponse } from "next/server";
import { listDiscussions } from "@/lib/discussions";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");
  if (!credentialId || !courseId) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }
  const items = await listDiscussions(credentialId, courseId);
  return NextResponse.json({ items });
}
