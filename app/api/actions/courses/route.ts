import { NextResponse } from "next/server";
import { z } from "zod";
import { getCredentialWithSecret } from "@/lib/credentials";
import { getSession, saveSession } from "@/lib/playwright/session";
import { login, isLoggedIn } from "@/lib/playwright/ut-login";
import { collectCourses } from "@/lib/playwright/ut-courses";
import { saveCourses } from "@/lib/courses";

export const runtime = "nodejs";
export const maxDuration = 180;

const Body = z.object({ credentialId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cred = await getCredentialWithSecret(parsed.data.credentialId);
  if (!cred) return NextResponse.json({ error: "credential not found" }, { status: 404 });

  try {
    const session = await getSession(cred.id);

    if (!(await isLoggedIn(session.page))) {
      await login(session.page, cred.username, cred.password);
      await saveSession(cred.id);
    }

    const courses = await collectCourses(session.page);
    await saveCourses(cred.id, courses);
    return NextResponse.json({ ok: true, count: courses.length, courses });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
