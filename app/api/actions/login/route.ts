import { NextResponse } from "next/server";
import { z } from "zod";
import { getCredentialWithSecret } from "@/lib/credentials";
import { getSession, saveSession } from "@/lib/playwright/session";
import { login } from "@/lib/playwright/ut-login";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    const result = await login(session.page, cred.username, cred.password);
    await saveSession(cred.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
