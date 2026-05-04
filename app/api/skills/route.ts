import { NextResponse } from "next/server";
import { z } from "zod";
import { listSkills, upsertSkill } from "@/lib/skills";

export const runtime = "nodejs";

export async function GET() {
  const skills = await listSkills();
  return NextResponse.json({ items: skills });
}

const Body = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
  name: z.string().min(1),
  systemPrompt: z.string(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, name, systemPrompt } = parsed.data;
  await upsertSkill(id, { name, systemPrompt });
  return NextResponse.json({ ok: true, id });
}
