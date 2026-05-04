import { Page } from "playwright";
import { logger } from "@/lib/activity-log";

export async function findForumPerkenalan(
  page: Page,
  courseUrl: string,
): Promise<string | null> {
  logger.info(`Opening course page`);
  await page.goto(courseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("a.aalink", { timeout: 15000 }).catch(() => {
    logger.warn("Timeout waiting for course activities");
  });

  const url = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a.aalink"));
    for (const a of links) {
      const name = a.querySelector("span.instancename");
      if (name && name.textContent?.toLowerCase().includes("forum perkenalan")) {
        return (a as HTMLAnchorElement).href;
      }
    }
    return null;
  });

  if (url) {
    logger.ok(`Forum Perkenalan found: ${url}`);
  } else {
    logger.warn("Forum Perkenalan not found on course page");
  }

  return url;
}
