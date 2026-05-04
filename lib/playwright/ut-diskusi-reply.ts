import { Page } from "playwright";
import { logger } from "@/lib/activity-log";

/**
 * Posts a tutor reply to a specific student post in a Diskusi forum thread,
 * then optionally sets the rating score on that student post.
 */
export async function postDiskusiReply(
  page: Page,
  discussionUrl: string,
  targetPostId: string, // data-post-id of the student post to reply to
  replyText: string,
  score?: number,
): Promise<void> {
  logger.info(`Opening discussion for postId ${targetPostId}`);
  await page.goto(discussionUrl, { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector("article[data-region='post']", { timeout: 15000 })
    .catch(() => {
      throw new Error("Posts not found — may not be logged in");
    });

  // Click the Reply link scoped to the specific post
  const replyLink = page.locator(
    `a[data-post-id="${targetPostId}"][data-action="collapsible-link"][title="Reply"]`,
  );
  await replyLink.click();

  // Wait for the inline form textarea scoped to this post
  const textarea = page.locator(
    `form[data-post-id="${targetPostId}"][data-content="inpage-reply-form"] textarea[name="post"]`,
  );
  await textarea.waitFor({ state: "visible", timeout: 10000 });
  await textarea.click();
  await textarea.fill(replyText);

  // Submit
  const submitBtn = page.locator(
    `form[data-post-id="${targetPostId}"] button[data-action="forum-inpage-submit"]`,
  );
  await submitBtn.click();

  // Wait for the form to hide (AJAX success)
  await Promise.race([
    page
      .locator(`form[data-post-id="${targetPostId}"][data-content="inpage-reply-form"]`)
      .waitFor({ state: "hidden", timeout: 20000 })
      .catch(() => {}),
    page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}),
  ]);

  logger.ok(`Reply posted for post ${targetPostId}`);

  // Set rating if provided — the select auto-saves on change (submits form to rate.php,
  // then redirects back via returnurl). Skip when score <= 0.
  if (score !== undefined && score > 0) {
    // After posting, the form may have been re-rendered. Reload the discussion so
    // the rating select for this post is attached and the returnurl is present.
    await page.goto(discussionUrl, { waitUntil: "domcontentloaded" });

    const ratingSelect = page.locator(`select#menurating${targetPostId}`);
    const exists = await ratingSelect.count();
    if (exists > 0) {
      const options = await ratingSelect.locator("option").evaluateAll((els) =>
        els
          .map((e) => ({
            value: (e as HTMLOptionElement).value,
            num: Number((e as HTMLOptionElement).value),
          }))
          .filter((o) => !isNaN(o.num) && o.num >= 0),
      );

      if (options.length > 0) {
        const closest = options.reduce((prev, curr) =>
          Math.abs(curr.num - score) < Math.abs(prev.num - score) ? curr : prev,
        );

        // Change submits the form; wait for the resulting navigation back via returnurl.
        await Promise.all([
          page
            .waitForLoadState("networkidle", { timeout: 20000 })
            .catch(() => {}),
          ratingSelect.selectOption(closest.value),
        ]);

        // Verify persistence — read aggregate back.
        const agg = await page
          .locator(`#ratingaggregate${targetPostId}`)
          .textContent()
          .catch(() => "");
        logger.ok(
          `Rating submitted ${closest.value} (target ${score}) for post ${targetPostId}` +
            (agg ? ` — aggregate now "${agg.trim()}"` : ""),
        );
      } else {
        logger.warn(`No numeric rating options for post ${targetPostId}`);
      }
    } else {
      logger.warn(`Rating select not found for post ${targetPostId}`);
    }
  }
}
