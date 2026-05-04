import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/playwright/session";
import { scrapeForumDiscussions } from "@/lib/playwright/ut-session-diskusi";
import {
  saveSessionDiscussion,
  saveSessionPosts,
  updateSessionDiscussionReplied,
} from "@/lib/session-diskusi";
import { getCredential } from "@/lib/credentials";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
  forumId: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { credentialId, courseId, forumId } = parsed.data;

  const forumUrl = `https://elearning.ut.ac.id/mod/forum/view.php?id=${forumId}`;

  try {
    const session = await getSession(credentialId);
    const cred = await getCredential(credentialId);
    const scraped = await scrapeForumDiscussions(session.page, forumUrl, cred?.username);

    const results = [];
    for (const { discussion: d, posts, iReplied } of scraped) {
      const { unchanged } = await saveSessionDiscussion(credentialId, courseId, forumId, {
        ...d,
        iReplied,
      });

      // Always re-save posts so manually updated scores on UT are captured.
      await saveSessionPosts(credentialId, courseId, forumId, d.id, posts);
      await updateSessionDiscussionReplied(credentialId, courseId, forumId, d.id, iReplied);

      if (unchanged) {
        logger.info(`"${d.title}" — no new posts, scores refreshed`);
        results.push({ id: d.id, status: "scores_refreshed", postCount: posts.length });
      } else {
        logger.ok(`"${d.title}" — ${posts.length} posts, replied: ${iReplied}`);
        results.push({ id: d.id, status: "updated", postCount: posts.length, iReplied });
      }
    }

    logger.ok(`Forum ${forumId} refresh complete`);
    return NextResponse.json({ ok: true, total: scraped.length, results });
  } catch (err) {
    logger.err(err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
