import { Page } from "playwright";
import type { Discussion } from "@/types";
import { logger } from "@/lib/activity-log";

export async function scrapeDiscussions(
  page: Page,
  forumUrl: string,
): Promise<Omit<Discussion, "iReplied" | "collectedAt">[]> {
  logger.info("Opening Forum Perkenalan");
  await page.goto(forumUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table.discussion-list", { timeout: 15000 }).catch(() => {
    logger.warn("Discussion table not found");
  });

  const rows = await page.$$eval(
    "tr.discussion[data-region='discussion-list-item']",
    (trs) =>
      trs.map((tr) => {
        const discussionId = tr.getAttribute("data-discussionid") ?? "";

        // Title + URL — inside th.topic
        const titleA = tr.querySelector("th.topic a") as HTMLAnchorElement | null;
        const title = titleA?.textContent?.trim() ?? "";
        const url = titleA?.href ?? "";

        // Started by — td.author (has class "author")
        const startedByCol = tr.querySelector("td.author");
        const startedBy =
          startedByCol?.querySelector(".author-info .text-truncate")?.textContent?.trim() ?? "";

        // Last post — td.text-left (unique; started-by col is td.author)
        const lastPostCol = tr.querySelector("td.text-left");
        const lastPostBy =
          lastPostCol?.querySelector(".author-info .text-truncate")?.textContent?.trim() ?? "";
        // Use data-timestamp (Unix seconds) — more reliable than datetime attr
        // which uses non-standard "+0700" offset (missing colon)
        const timeEl = lastPostCol?.querySelector("time");
        const ts = timeEl?.getAttribute("data-timestamp");
        const lastPostDate = ts
          ? new Date(parseInt(ts, 10) * 1000).toISOString()
          : timeEl?.getAttribute("datetime") ?? "";

        // Replies — td that has px-2 AND fit-content but NOT icon-no-margin (star col has icon-no-margin)
        // The star col: "p-0 text-center align-middle icon-no-margin"
        // The replies col: "p-0 text-center align-middle fit-content px-2"
        const repliesCell = tr.querySelector("td.fit-content.px-2");
        const repliesCount = parseInt(
          repliesCell?.querySelector("span")?.textContent?.trim() ?? "0",
          10,
        );

        return { id: discussionId, title, url, startedBy, lastPostBy, lastPostDate, repliesCount };
      }),
  );

  const valid = rows.filter((r) => r.id && r.url);
  logger.ok(`Found ${valid.length} discussions`);
  return valid;
}
