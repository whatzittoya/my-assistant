import { NextRequest, NextResponse } from "next/server";
import { buildScoreMonitor } from "@/lib/gradebook";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");

  if (!credentialId || !courseId) {
    return NextResponse.json({ error: "credentialId and courseId required" }, { status: 400 });
  }

  try {
    const monitor = await buildScoreMonitor(credentialId, courseId);
    return NextResponse.json(monitor);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
