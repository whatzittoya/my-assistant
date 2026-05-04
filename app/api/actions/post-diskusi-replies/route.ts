import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/playwright/session";
import { postDiskusiReply } from "@/lib/playwright/ut-diskusi-reply";
import { updateSessionDiscussionReplied } from "@/lib/session-diskusi";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const ItemSchema = z.object({
  postId: z.string().min(1),
  reply: z.string().min(1),
  score: z.number().int().min(0).max(100).optional(),
});

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  forumId: z.string().min(1),
  discId: z.string().min(1),
  discussionUrl: z.string().url(),
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

  const { credentialId, courseId, forumId, discId, discussionUrl, items, delayMin, delayMax } =
    parsed.data;

  const results: Array<{ postId: string; status: "ok" | "error"; error?: string }> = [];

  try {
    const session = await getSession(credentialId);

    // Navigate to discussion page first and wait 2s for full load before posting
    logger.info("Pre-loading discussion page");
    await session.page.goto(discussionUrl, { waitUntil: "domcontentloaded" });
    await sleep(2000);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.info(`Posting reply ${i + 1}/${items.length} for post ${item.postId}`);

      try {
        await postDiskusiReply(
          session.page,
          discussionUrl,
          item.postId,
          item.reply,
          item.score,
        );
        results.push({ postId: item.postId, status: "ok" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.err(`Failed on post ${item.postId}: ${msg}`);
        results.push({ postId: item.postId, status: "error", error: msg });
      }

      if (i < items.length - 1) {
        const delay = randomDelayMs(delayMin, delayMax);
        logger.info(`Waiting ${(delay / 1000).toFixed(1)}s before next...`);
        await sleep(delay);
      }
    }

    const ok = results.filter((r) => r.status === "ok").length;
    const failed = results.filter((r) => r.status === "error").length;

    // Mark discussion as replied if at least one succeeded
    if (ok > 0) {
      await updateSessionDiscussionReplied(credentialId, courseId, forumId, discId, true);
    }

    logger.ok(`Done: ${ok} posted, ${failed} failed`);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.err(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
