import { NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/lib/sessions";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");

  if (!credentialId || !courseId) {
    return NextResponse.json({ error: "credentialId and courseId required" }, { status: 400 });
  }

  const items = await listSessions(credentialId, courseId);
  return NextResponse.json({ items });
}
