import { Page } from "playwright";
import type { Discussion, Post } from "@/types";
import { logger } from "@/lib/activity-log";
import { scrapeDiscussions } from "@/lib/playwright/ut-discussions";
import { scrapePosts, allStudentsAnswered } from "@/lib/playwright/ut-posts";

export type ScrapedForumResult = {
  discussion: Omit<Discussion, "iReplied" | "collectedAt">;
  posts: Post[];
  iReplied: boolean;
};

/**
 * Scrapes a Moodle forum that may be:
 *   (a) a single-discussion forum — view.php redirects straight to discuss.php
 *   (b) a multi-discussion forum — view.php shows a list of threads
 *
 * Returns one entry per discussion thread found.
 */
export async function scrapeForumDiscussions(
  page: Page,
  forumUrl: string,
  lecturerId?: string,
): Promise<ScrapedForumResult[]> {
  logger.info(`Navigating to forum: ${forumUrl}`);
  await page.goto(forumUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500); // let redirect settle

  const currentUrl = page.url();
  logger.info(`Landed on: ${currentUrl}`);

  // ── Case (a): discuss.php redirect OR simple-discussion forum on view.php ─
  const discMatch = currentUrl.match(/discuss\.php\?d=(\d+)/);

  // Simple discussion forum: URL stays view.php but renders posts directly
  const hasPostsOnPage = !discMatch
    ? await page.$("article[data-region='post']").then((el) => !!el).catch(() => false)
    : false;

  if (discMatch || hasPostsOnPage) {
    // Extract discussion id: from URL or from a discuss.php link on the page
    let discId = discMatch?.[1] ?? "";
    if (!discId) {
      const fromLink = await page
        .$eval(
          "a[href*='discuss.php?d=']",
          (a) => {
            const linkMatch = (a as HTMLAnchorElement).href.match(/\?d=(\d+)/);
            return linkMatch ? linkMatch[1] : "";
          },
        )
        .catch(() => "");
      const fromUrl = forumUrl.match(/[?&]id=(\d+)/)?.[1] ?? "0";
      discId = fromLink || fromUrl;
    }
    logger.info(`Single-discussion forum (${discMatch ? "redirect" : "simple type"}), thread id=${discId}`);

    // Wait for root post
    await page
      .waitForSelector("article[data-region='post']", { timeout: 15000 })
      .catch(() => logger.warn("Post selector timeout"));

    const posts = await scrapePosts(page, currentUrl, lecturerId);

    // Root post (depth 0) = the prompt
    const rootPost = posts.find((p) => p.depth === 0);

    const title =
      (await page
        .$eval(
          "[data-region-content='forum-post-core-subject']",
          (el) => el.textContent?.trim() ?? "",
        )
        .catch(() => "")) || rootPost?.subject || `Discussion ${discId}`;

    // Last non-root post for lastPostBy / lastPostDate
    const replies = posts.filter((p) => p.depth > 0);
    const lastReply = replies.sort((a, b) =>
      (b.datetimeIso ?? "").localeCompare(a.datetimeIso ?? ""),
    )[0];

    const discussion: Omit<Discussion, "iReplied" | "collectedAt"> = {
      id: discId,
      title,
      url: currentUrl,
      startedBy: rootPost?.author ?? "",
      lastPostBy: lastReply?.author ?? "",
      lastPostDate: lastReply?.datetimeIso ?? "",
      repliesCount: replies.length,
    };

    const iReplied = allStudentsAnswered(posts);
    logger.ok(`Single thread: ${posts.length} posts, all replied: ${iReplied}`);
    return [{ discussion, posts, iReplied }];
  }

  // ── Case (b): multi-discussion forum list ──────────────────────────────
  logger.info("Multi-discussion forum, scraping list");
  const rawDiscussions = await scrapeDiscussions(page, forumUrl);
  logger.info(`Found ${rawDiscussions.length} discussions`);

  const results: ScrapedForumResult[] = [];
  for (const d of rawDiscussions) {
    const posts = await scrapePosts(page, d.url, lecturerId);
    results.push({ discussion: d, posts, iReplied: allStudentsAnswered(posts) });
  }
  return results;
}
