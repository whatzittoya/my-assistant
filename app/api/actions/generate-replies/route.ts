import { NextResponse } from "next/server";
import { z } from "zod";
import { gemini, MODEL } from "@/lib/gemini";
import { getSkill } from "@/lib/skills";
import { listNeedsReply } from "@/lib/discussions";
import { Type } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  credentialId: z.string().min(1),
  skillId: z.string().default("forum-perkenalan"),
});

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, skillId } = parsed.data;

  const [skill, groups] = await Promise.all([
    getSkill(skillId),
    listNeedsReply(credentialId),
  ]);

  if (!skill)
    return NextResponse.json({ error: `Skill "${skillId}" not found` }, { status: 404 });

  if (groups.length === 0)
    return NextResponse.json({ replies: [] });

  // Build prompt
  const sections = groups.map(({ discussion, posts }, i) => {
    const sorted = [...posts].sort((a, b) =>
      (a.datetimeIso ?? "").localeCompare(b.datetimeIso ?? ""),
    );
    const thread = sorted
      .map((p) => {
        const label = p.depth === 0 ? "[Kiriman Awal]" : "[Balasan]";
        return `${label} ${p.author}:\n${stripHtml(p.contentHtml)}`;
      })
      .join("\n\n");

    return `=== Diskusi ${i + 1} ===\nID: ${discussion.id}\nJudul: ${discussion.title}\nDitulis oleh: ${discussion.startedBy}\n\n${thread}`;
  });

  const userPrompt =
    `Berikut adalah ${groups.length} diskusi mahasiswa yang perlu dibalas. ` +
    `Hasilkan balasan untuk setiap diskusi.\n\n` +
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
          replies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                discussionId: { type: Type.STRING },
                reply: { type: Type.STRING },
              },
              required: ["discussionId", "reply"],
            },
          },
        },
        required: ["replies"],
      },
    },
  });

  const raw = response.text ?? "{}";
  const parsed2 = JSON.parse(raw) as {
    replies: Array<{ discussionId: string; reply: string }>;
  };

  // Attach courseId so the client can key by discussionId
  const withCourse = parsed2.replies.map((r) => {
    const group = groups.find((g) => g.discussion.id === r.discussionId);
    return { ...r, courseId: group?.courseId ?? "" };
  });

  return NextResponse.json({ replies: withCourse });
}
