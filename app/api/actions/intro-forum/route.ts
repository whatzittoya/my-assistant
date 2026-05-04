import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/playwright/session";
import { findForumPerkenalan } from "@/lib/playwright/ut-forum";
import { getCourse, updateCourseForumUrl } from "@/lib/courses";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  if (!course) return NextResponse.json({ error: "course not found" }, { status: 404 });

  try {
    const session = await getSession(credentialId);
    const forumUrl = await findForumPerkenalan(session.page, course.url);
    if (!forumUrl) {
      return NextResponse.json({ error: "Forum Perkenalan not found on course page" }, { status: 404 });
    }
    await updateCourseForumUrl(credentialId, courseId, forumUrl);
    return NextResponse.json({ ok: true, forumUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
