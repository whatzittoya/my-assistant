import { NextResponse } from "next/server";
import { z } from "zod";
import { gemini, MODEL, geminiDisabledResponse } from "@/lib/gemini";
import { getSkill } from "@/lib/skills";
import { listSessionPosts, getSessionDiscussion, getDiskusiMeta } from "@/lib/session-diskusi";
import { Type } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  forumId: z.string().min(1),
  discId: z.string().min(1),
  skillId: z.string().min(1),
  maxStudents: z.number().int().min(1).max(200).optional(),
  postIds: z.array(z.string()).optional(), // if set, only generate for these specific postIds
});

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  const disabled = geminiDisabledResponse();
  if (disabled) return disabled;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, courseId, forumId, discId, skillId, maxStudents, postIds } = parsed.data;

  const [skill, discussion, allPosts, meta] = await Promise.all([
    getSkill(skillId),
    getSessionDiscussion(credentialId, courseId, forumId, discId),
    listSessionPosts(credentialId, courseId, forumId, discId),
    getDiskusiMeta(credentialId, courseId, forumId, discId),
  ]);

  if (!skill)
    return NextResponse.json({ error: `Skill "${skillId}" not found` }, { status: 404 });
  if (!discussion)
    return NextResponse.json({ error: "Discussion not found" }, { status: 404 });

  // Student posts = any non-tutor post (any depth) without a direct lecturer child reply.
  // Includes depth-0 thread-starters (each-student-own-discussion model) and
  // nested off-thread replies (students who replied inside another student's thread).
  const allStudentPosts = allPosts.filter(
    (p) =>
      !p.isMyPost &&
      !allPosts.some((r) => r.isMyPost && r.parentPostId === p.postId),
  );

  if (allStudentPosts.length === 0)
    return NextResponse.json({ results: [] });

  // Filter by specific postIds if provided (for per-student regenerate)
  // Otherwise apply maxStudents limit, sorted oldest first
  let studentPosts = allStudentPosts;
  if (postIds && postIds.length > 0) {
    studentPosts = allStudentPosts.filter((p) => postIds.includes(p.postId));
  } else {
    const sorted = [...allStudentPosts].sort((a, b) =>
      (a.datetimeIso ?? "").localeCompare(b.datetimeIso ?? ""),
    );
    studentPosts = maxStudents ? sorted.slice(0, maxStudents) : sorted;
  }

  // Root post is the discussion question only when authored by the lecturer
  // (session-diskusi style). In each-student-own-discussion forums the depth-0
  // post is a student's own answer — not a question — so skip it.
  const rootPost = allPosts.find((p) => p.depth === 0);
  const questionText = meta.question.trim()
    ? meta.question.trim()
    : rootPost && rootPost.isMyPost
      ? stripHtml(rootPost.contentHtml)
      : "";
  const rootContext = questionText ? `Pertanyaan diskusi:\n${questionText}\n\n` : "";

  const activePedoman = meta.pedomanItems.filter((p) => p.criteria.trim());
  const pedomanContext =
    activePedoman.length > 0
      ? `Pedoman Penilaian (Total maks. ${activePedoman.reduce((s, p) => s + p.maxScore, 0)} poin):\n` +
        activePedoman.map((p, i) => `${i + 1}. ${p.criteria} (maks. ${p.maxScore} poin)`).join("\n") +
        "\n\n"
      : "";

  const sections = studentPosts.map((p, i) => {
    return (
      `--- Kiriman Mahasiswa ${i + 1} ---\n` +
      `ID: ${p.postId}\n` +
      `Mahasiswa: ${p.author}\n` +
      `Isi:\n${stripHtml(p.contentHtml)}`
    );
  });

  const userPrompt =
    `Diskusi: ${discussion.title}\n\n` +
    rootContext +
    pedomanContext +
    `Berikut adalah ${studentPosts.length} kiriman mahasiswa yang perlu dinilai dan dibalas.\n` +
    `Untuk setiap kiriman:\n` +
    `1. Beri skor kualitas jawaban 1–100\n` +
    `2. Buat 1 balasan yang tepat dan personal\n\n` +
    sections.join("\n\n");

  const response = await gemini().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: skill.systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          results: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                postId: { type: Type.STRING },
                author: { type: Type.STRING },
                score: { type: Type.INTEGER },
                replies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["postId", "author", "score", "replies"],
            },
          },
        },
        required: ["results"],
      },
    },
  });

  const raw = response.text ?? "{}";
  const result = JSON.parse(raw) as {
    results: Array<{ postId: string; author: string; score: number; replies: string[] }>;
  };

  return NextResponse.json({ results: result.results ?? [] });
}
