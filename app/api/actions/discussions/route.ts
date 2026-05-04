import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/playwright/session";
import { scrapeDiscussions } from "@/lib/playwright/ut-discussions";
import { scrapePosts, hasMyReply } from "@/lib/playwright/ut-posts";
import { saveDiscussion, savePosts, updateDiscussionReplied } from "@/lib/discussions";
import { getCourse } from "@/lib/courses";
import { getCredential } from "@/lib/credentials";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  credentialId: z.string().min(1),
  courseId: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { credentialId, courseId } = parsed.data;

  const course = await getCourse(credentialId, courseId);
  if (!course?.forumPerkenalan) {
    return NextResponse.json(
      { error: "Forum Perkenalan URL not found. Run 'Find intro forum' first." },
      { status: 400 },
    );
  }

  try {
    const session = await getSession(credentialId);
    const cred = await getCredential(credentialId);
    const rawDiscussions = await scrapeDiscussions(session.page, course.forumPerkenalan);

    const results = [];
    logger.info(`Processing ${rawDiscussions.length} discussions`);

    for (const d of rawDiscussions) {
      const { unchanged } = await saveDiscussion(credentialId, courseId, {
        ...d,
        iReplied: false,
      });

      if (unchanged) {
        logger.info(`Skip "${d.title}" — unchanged`);
        results.push({ id: d.id, status: "unchanged" });
        continue;
      }

      const posts = await scrapePosts(session.page, d.url, cred?.username);
      await savePosts(credentialId, courseId, d.id, posts);

      const replied = hasMyReply(posts);
      await updateDiscussionReplied(credentialId, courseId, d.id, replied);

      logger.ok(`"${d.title}" — ${posts.length} posts, replied: ${replied}`);
      results.push({ id: d.id, status: "updated", postCount: posts.length, iReplied: replied });
    }

    logger.ok("Discussion refresh complete");
    return NextResponse.json({ ok: true, total: rawDiscussions.length, results });
  } catch (err) {
    logger.err(err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
