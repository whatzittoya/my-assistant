import { NextResponse } from "next/server";
import { z } from "zod";
import { getDiskusiMeta, saveDiskusiMeta } from "@/lib/session-diskusi";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ forumId: string; discId: string }> },
) {
  const { forumId, discId } = await params;
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");
  if (!credentialId || !courseId)
    return NextResponse.json({ error: "credentialId and courseId required" }, { status: 400 });

  try {
    const meta = await getDiskusiMeta(credentialId, courseId, forumId, discId);
    return NextResponse.json(meta);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const PedomanItemSchema = z.object({
  id: z.string().min(1),
  criteria: z.string(),
  maxScore: z.number().min(0),
});

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  question: z.string(),
  pedomanItems: z.array(PedomanItemSchema),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ forumId: string; discId: string }> },
) {
  const { forumId, discId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, courseId, question, pedomanItems } = parsed.data;
  try {
    await saveDiskusiMeta(credentialId, courseId, forumId, discId, { question, pedomanItems });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
