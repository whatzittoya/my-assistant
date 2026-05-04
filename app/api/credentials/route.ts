import { NextResponse } from "next/server";
import { z } from "zod";
import { listCredentials, createCredential } from "@/lib/credentials";

export const runtime = "nodejs";

const CreateSchema = z.object({
  label: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function GET() {
  const items = await listCredentials();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = await createCredential(parsed.data);
  return NextResponse.json(created, { status: 201 });
}
