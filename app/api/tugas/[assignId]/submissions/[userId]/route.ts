import { NextResponse } from "next/server";
import { z } from "zod";
import { getSubmission, saveAiEval, saveFinalEval } from "@/lib/tugas";

export const dynamic = "force-dynamic";

type Params = Promise<{ assignId: string; userId: string }>;

export async function GET(req: Request, { params }: { params: Params }) {
  const { assignId, userId } = await params;
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get("credentialId");
  const courseId = searchParams.get("courseId");
  if (!credentialId || !courseId)
    return NextResponse.json({ error: "credentialId and courseId required" }, { status: 400 });

  try {
    const submission = await getSubmission(credentialId, courseId, assignId, userId);
    if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(submission);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const CriteriaScoreSchema = z.object({
  id: z.string().optional().default(""),
  criteria: z.string(),
  score: z.number().min(0),
  maxScore: z.number().min(0),
});

const AiEvalBody = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  type: z.literal("ai"),
  criteriaScores: z.array(CriteriaScoreSchema),
  totalScore: z.number().min(0),
  reasoning: z.string(),
  feedback: z.string(),
});

const FinalEvalBody = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  type: z.literal("final"),
  criteriaScores: z.array(CriteriaScoreSchema),
  feedback: z.string(),
});

const Body = z.discriminatedUnion("type", [AiEvalBody, FinalEvalBody]);

export async function PUT(req: Request, { params }: { params: Params }) {
  const { assignId, userId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, courseId } = parsed.data;

  try {
    if (parsed.data.type === "ai") {
      await saveAiEval(credentialId, courseId, assignId, userId, {
        criteriaScores: parsed.data.criteriaScores,
        totalScore: parsed.data.totalScore,
        reasoning: parsed.data.reasoning,
        feedback: parsed.data.feedback,
      });
    } else {
      const totalScore = parsed.data.criteriaScores.reduce((s, c) => s + c.score, 0);
      await saveFinalEval(credentialId, courseId, assignId, userId, {
        criteriaScores: parsed.data.criteriaScores,
        totalScore,
        feedback: parsed.data.feedback,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
