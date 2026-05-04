import { NextResponse } from "next/server";
import { z } from "zod";
import { gemini, MODEL } from "@/lib/gemini";
import { getSkill } from "@/lib/skills";
import { getDiscussion, listPosts } from "@/lib/discussions";
import { Type } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  discussionId: z.string().min(1),
  skillId: z.string().default("forum-perkenalan"),
});

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, courseId, discussionId, skillId } = parsed.data;

  const [skill, discussion, posts] = await Promise.all([
    getSkill(skillId),
    getDiscussion(credentialId, courseId, discussionId),
    listPosts(credentialId, courseId, discussionId),
  ]);

  if (!skill)
    return NextResponse.json({ error: `Skill "${skillId}" not found` }, { status: 404 });
  if (!discussion)
    return NextResponse.json({ error: "Discussion not found" }, { status: 404 });

  const sorted = [...posts].sort((a, b) =>
    (a.datetimeIso ?? "").localeCompare(b.datetimeIso ?? ""),
  );

  const thread = sorted
    .map((p) => {
      const label = p.depth === 0 ? "[Kiriman Awal]" : "[Balasan]";
      return `${label} ${p.author}:\n${stripHtml(p.contentHtml)}`;
    })
    .join("\n\n");

  const userPrompt =
    `Diskusi: ${discussion.title}\nDitulis oleh: ${discussion.startedBy}\n\n${thread}`;

  const response = await gemini().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: skill.systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING },
        },
        required: ["reply"],
      },
    },
  });

  const raw = response.text ?? "{}";
  const result = JSON.parse(raw) as { reply: string };

  return NextResponse.json({ reply: result.reply ?? "" });
}
