import { NextResponse } from "next/server";
import { z } from "zod";
import { getTugasMeta, saveTugasMeta } from "@/lib/tugas-meta";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ assignId: string }> },
) {
  const { assignId } = await params;
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");
  if (!credentialId || !courseId)
    return NextResponse.json({ error: "credentialId and courseId required" }, { status: 400 });

  try {
    const meta = await getTugasMeta(credentialId, courseId, assignId);
    return NextResponse.json(meta);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const PedomanItemSchema = z.object({
  criteria: z.string(),
  maxScore: z.number().min(0),
});

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  description: z.string(),
  pedomanItems: z.array(PedomanItemSchema),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ assignId: string }> },
) {
  const { assignId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, courseId, description, pedomanItems } = parsed.data;
  try {
    await saveTugasMeta(credentialId, courseId, assignId, { description, pedomanItems });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
