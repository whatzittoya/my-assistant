import type { Page } from "playwright";
import { scrapeForumDiscussions } from "@/lib/playwright/ut-session-diskusi";
import {
  saveSessionDiscussion,
  saveSessionPosts,
  updateSessionDiscussionReplied,
} from "@/lib/session-diskusi";
import { logger } from "@/lib/activity-log";

export type ForumRefreshResult =
  | { id: string; status: "scores_refreshed"; postCount: number }
  | { id: string; status: "updated"; postCount: number; iReplied: boolean };

/**
 * Scrape one session-diskusi forum and persist its threads + posts.
 * Caller must hold the credential lock and pass an already-logged-in page.
 */
export async function refreshForumDiscussions(
  page: Page,
  credentialId: string,
  courseId: string,
  forumId: string,
  username?: string,
): Promise<ForumRefreshResult[]> {
  const forumUrl = `https://elearning.ut.ac.id/mod/forum/view.php?id=${forumId}`;
  const scraped = await scrapeForumDiscussions(page, forumUrl, username);

  const results: ForumRefreshResult[] = [];
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
  return results;
}
