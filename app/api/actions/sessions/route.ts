import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/playwright/session";
import { scrapeSessions } from "@/lib/playwright/ut-sessions";
import { saveSessions } from "@/lib/sessions";
import { getCourse } from "@/lib/courses";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { credentialId, courseId } = parsed.data;

  const course = await getCourse(credentialId, courseId);
  if (!course) {
    return NextResponse.json({ error: "course not found" }, { status: 404 });
  }

  try {
    const session = await getSession(credentialId);
    const sessions = await scrapeSessions(session.page, course.url);
    await saveSessions(credentialId, courseId, sessions);
    return NextResponse.json({ count: sessions.length, sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
