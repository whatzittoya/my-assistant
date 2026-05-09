import { NextResponse } from "next/server";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { gemini } from "@/lib/gemini";
import { getSkill } from "@/lib/skills";
import { getTugasMeta } from "@/lib/tugas-meta";
import { listTugasSubmissions, saveAiEval } from "@/lib/tugas";
import { Type } from "@google/genai";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const FILES_BASE = path.join(process.cwd(), ".tugas-files");

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  assignId: z.string().min(1),
  skillId: z.string().min(1),
  model: z.string().min(1),
  userIds: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, courseId, assignId, skillId, model, userIds } = parsed.data;

  const [skill, meta, allSubmissions] = await Promise.all([
    getSkill(skillId),
    getTugasMeta(credentialId, courseId, assignId),
    listTugasSubmissions(credentialId, courseId, assignId),
  ]);

  if (!skill)
    return NextResponse.json({ error: `Skill "${skillId}" not found` }, { status: 404 });

  const submissions = userIds?.length
    ? allSubmissions.filter((s) => userIds.includes(s.userId))
    : allSubmissions;

  if (submissions.length === 0)
    return NextResponse.json({ results: [] });

  const totalMax = meta.pedomanItems.reduce((sum, item) => sum + item.maxScore, 0) || 100;
  const hasCriteria = meta.pedomanItems.length > 0;

  const pedomanBlock = hasCriteria
    ? [
        `Pedoman Penilaian (Total Maks. ${totalMax} poin):`,
        ...meta.pedomanItems.map(
          (item, i) => `${i + 1}. [id:${item.id}] ${item.criteria} — maks. ${item.maxScore} poin`,
        ),
        `\nKembalikan criteriaScores dengan field "id" (gunakan ID dalam tanda kurung di atas), "score", dan "maxScore" saja — tidak perlu field "criteria".`,
        `totalScore adalah jumlah semua skor kriteria (0–${totalMax}).`,
      ].join("\n")
    : "";

  const systemInstruction = [
    skill.systemPrompt,
    meta.description ? `\nDeskripsi Tugas:\n${meta.description}` : "",
    pedomanBlock || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Build responseSchema dynamically based on whether criteria exist
  const criteriaScoreSchema = hasCriteria
    ? {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Criterion ID from the pedoman" },
          score: { type: Type.INTEGER, minimum: 0 },
          maxScore: { type: Type.INTEGER, minimum: 0 },
        },
        required: ["id", "score", "maxScore"],
      }
    : {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          score: { type: Type.INTEGER, minimum: 0 },
          maxScore: { type: Type.INTEGER, minimum: 0 },
        },
        required: ["id", "score", "maxScore"],
      };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      criteriaScores: {
        type: Type.ARRAY,
        items: criteriaScoreSchema,
        description: hasCriteria
          ? "Score per criterion matching the pedoman penilaian"
          : "Empty array if no criteria defined",
      },
      totalScore: { type: Type.INTEGER, minimum: 0, maximum: totalMax },
      reasoning: {
        type: Type.STRING,
        description: "Internal reasoning explaining why these scores were given",
      },
      feedback: {
        type: Type.STRING,
        description: "Public feedback comment to be shown to the student",
      },
    },
    required: ["name", "criteriaScores", "totalScore", "reasoning", "feedback"],
  };

  const ai = gemini();
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  (async () => {
    for (const sub of submissions) {
      logger.info(`Evaluating ${sub.name}`);

      try {
        const parts: { text?: string; fileData?: { fileUri: string; mimeType: string } }[] = [
          { text: `Nama mahasiswa: ${sub.name}` },
        ];

        for (const file of sub.files) {
          if (!file.localPath) continue;
          const absPath = path.join(FILES_BASE, file.localPath);
          if (!fs.existsSync(absPath)) {
            logger.warn(`File not found on disk: ${file.filename}`);
            continue;
          }

          const ext = path.extname(file.localPath).toLowerCase();
          const mimeType = MIME_MAP[ext] ?? "application/pdf";

          // Multipart upload filename must be Latin-1 safe — pass a File object with sanitized name
          const rawName = path.basename(file.localPath);
          const safeName = rawName
            .replace(/[–—]/g, "-")          // typographic dashes → hyphen
            .replace(/[^\x00-\xFF]/g, "_"); // everything else outside Latin-1

          const fileBuffer = fs.readFileSync(absPath);
          const fileObj = new File([fileBuffer], safeName, { type: mimeType });

          const uploaded = await ai.files.upload({
            file: fileObj,
            config: { mimeType, displayName: safeName },
          });

          if (uploaded.uri) {
            parts.push({ fileData: { fileUri: uploaded.uri, mimeType } });
            logger.info(`Uploaded ${path.basename(file.localPath)} → ${uploaded.uri}`);
          }
        }

        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        const raw = response.text ?? "{}";
        const result = JSON.parse(raw) as {
          name: string;
          criteriaScores: { id?: string; criteria?: string; score: number; maxScore: number }[];
          totalScore: number;
          reasoning: string;
          feedback: string;
        };

        // Build a lookup map from pedoman ids
        const pedomanById = new Map(meta.pedomanItems.map((p) => [p.id, p]));

        // Resolve id → full CriteriaScore, filling in criteria text and maxScore from pedoman
        const resolvedCriteria = (result.criteriaScores ?? []).map((c) => {
          const pedoman = c.id ? pedomanById.get(c.id) : undefined;
          return {
            id: c.id ?? "",
            criteria: pedoman?.criteria ?? c.criteria ?? c.id ?? "",
            score: c.score,
            maxScore: pedoman?.maxScore ?? c.maxScore,
          };
        });

        const totalScore =
          resolvedCriteria.length > 0
            ? resolvedCriteria.reduce((s, c) => s + c.score, 0)
            : (result.totalScore ?? 0);

        const evalData = {
          criteriaScores: resolvedCriteria,
          totalScore,
          reasoning: result.reasoning ?? "",
          feedback: result.feedback ?? "",
        };

        // Persist to Firestore immediately
        try {
          await saveAiEval(credentialId, courseId, assignId, sub.userId, evalData);
        } catch (saveErr) {
          logger.warn(`saveAiEval failed for ${sub.name}: ${saveErr}`);
        }

        logger.ok(`${sub.name}: score=${totalScore}`);
        await writer.write(
          encoder.encode(
            JSON.stringify({
              userId: sub.userId,
              name: result.name || sub.name,
              ...evalData,
            }) + "\n",
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.err(`${sub.name}: ${msg}`);
        await writer.write(
          encoder.encode(
            JSON.stringify({
              userId: sub.userId,
              name: sub.name,
              criteriaScores: [],
              totalScore: 0,
              reasoning: "",
              feedback: "",
              error: msg,
            }) + "\n",
          ),
        );
      }
    }
    await writer.close();
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
