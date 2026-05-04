import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/playwright/session";
import { postForumReply } from "@/lib/playwright/ut-reply";
import { updateDiscussionReplied } from "@/lib/discussions";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const ItemSchema = z.object({
  discussionId: z.string().min(1),
  courseId: z.string().min(1),
  discussionUrl: z.string().url(),
  reply: z.string().min(1),
});

const Body = z.object({
  credentialId: z.string().min(1),
  items: z.array(ItemSchema).min(1),
  delayMin: z.number().min(1).max(60).default(5),
  delayMax: z.number().min(1).max(60).default(6),
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minS: number, maxS: number) {
  return (minS + Math.random() * (maxS - minS)) * 1000;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { credentialId, items, delayMin, delayMax } = parsed.data;

  const results: Array<{
    discussionId: string;
    status: "ok" | "error";
    error?: string;
  }> = [];

  try {
    const session = await getSession(credentialId);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.info(
        `Replying ${i + 1}/${items.length}: discussion ${item.discussionId}`,
      );

      try {
        await postForumReply(session.page, item.discussionUrl, item.reply);
        await updateDiscussionReplied(credentialId, item.courseId, item.discussionId, true);
        results.push({ discussionId: item.discussionId, status: "ok" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.err(`Failed on ${item.discussionId}: ${msg}`);
        results.push({ discussionId: item.discussionId, status: "error", error: msg });
      }

      // Delay before next reply (skip delay after the last one)
      if (i < items.length - 1) {
        const delay = randomDelayMs(delayMin, delayMax);
        logger.info(
          `Waiting ${(delay / 1000).toFixed(1)}s before next reply...`,
        );
        await sleep(delay);
      }
    }

    const ok = results.filter((r) => r.status === "ok").length;
    const failed = results.filter((r) => r.status === "error").length;
    logger.ok(`Done: ${ok} posted, ${failed} failed`);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.err(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
