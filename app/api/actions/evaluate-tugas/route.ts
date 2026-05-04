import { NextResponse } from "next/server";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { gemini } from "@/lib/gemini";
import { getSkill } from "@/lib/skills";
import { getTugasMeta } from "@/lib/tugas-meta";
import { listTugasSubmissions } from "@/lib/tugas";
import { Type } from "@google/genai";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

// Files are already converted to PDF during download — just map extension to MIME
const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const FILES_BASE = path.join(process.cwd(), ".tugas-files");

// ── Route ──────────────────────────────────────────────────────────────────────

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

  const pedomanBlock =
    meta.pedomanItems.length > 0
      ? [
          `Pedoman Penilaian (Total Maks. ${totalMax} poin):`,
          ...meta.pedomanItems.map(
            (item, i) => `${i + 1}. ${item.criteria} — maks. ${item.maxScore} poin`,
          ),
          `\nBerikan skor total antara 0 sampai ${totalMax}.`,
        ].join("\n")
      : "";

  const systemInstruction = [
    skill.systemPrompt,
    meta.description ? `\nDeskripsi Tugas:\n${meta.description}` : "",
    pedomanBlock || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const ai = gemini();
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  // Process sequentially in background — write each result immediately
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

          const uploaded = await ai.files.upload({
            file: absPath,
            config: { mimeType, displayName: path.basename(file.localPath) },
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
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                score: { type: Type.INTEGER, minimum: 0, maximum: totalMax },
                feedback: { type: Type.STRING },
              },
              required: ["name", "score", "feedback"],
            },
          },
        });

        const raw = response.text ?? "{}";
        const result = JSON.parse(raw) as { name: string; score: number; feedback: string };
        logger.ok(`${sub.name}: score=${result.score}`);
        await writer.write(
          encoder.encode(
            JSON.stringify({ userId: sub.userId, name: result.name || sub.name, score: result.score, feedback: result.feedback }) + "\n",
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.err(`${sub.name}: ${msg}`);
        await writer.write(
          encoder.encode(
            JSON.stringify({ userId: sub.userId, name: sub.name, score: 0, feedback: "", error: msg }) + "\n",
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
