import { Page } from "playwright";
import { logger } from "@/lib/activity-log";

/**
 * Navigates to a Forum Perkenalan discussion, clicks Reply on the root post,
 * fills in the reply text, and submits it.
 */
export async function postForumReply(
  page: Page,
  discussionUrl: string,
  replyText: string,
): Promise<void> {
  logger.info(`Opening discussion for reply`);
  await page.goto(discussionUrl, { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector("article[data-region='post']", { timeout: 15000 })
    .catch(() => {
      throw new Error("Discussion posts not found — may not be logged in");
    });

  // Click the Reply link on the root (first) post
  // Selector: collapsible-link action = triggers inline reply form
  const replyLink = page
    .locator('a[title="Reply"][data-action="collapsible-link"]')
    .first();
  await replyLink.click();

  // Wait for the inline reply textarea to appear
  const textarea = page
    .locator('form[data-content="inpage-reply-form"] textarea[name="post"]')
    .first();
  await textarea.waitFor({ state: "visible", timeout: 10000 });

  // Click to focus, then fill with the draft
  await textarea.click();
  await textarea.fill(replyText);

  // Click "Post to forum"
  const submitBtn = page
    .locator('button[data-action="forum-inpage-submit"]')
    .first();
  await submitBtn.click();

  // Wait for the form to disappear (AJAX success) or page to navigate
  await Promise.race([
    page
      .locator('form[data-content="inpage-reply-form"]')
      .first()
      .waitFor({ state: "hidden", timeout: 20000 })
      .catch(() => {}),
    page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}),
  ]);

  logger.ok("Reply posted");
}
