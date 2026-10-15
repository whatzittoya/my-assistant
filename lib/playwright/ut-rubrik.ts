import type { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/lib/activity-log";
import { downloadResource } from "@/lib/playwright/download";
import type { RubrikFile } from "@/types";

export const RUBRIK_FILES_BASE = path.join(process.cwd(), ".rubrik-files");

// Activities named "Rubrik Diskusi 1", "Rubrik Penilaian Diskusi", …
const RUBRIK_RE = /rubrik/i;

/** Activity links in the course section whose name mentions "rubrik". */
async function findRubrikActivities(page: Page): Promise<{ name: string; url: string }[]> {
  const all = await page.$$eval(".activityname a.aalink", (els) =>
    els
      .map((a) => {
        const span = a.querySelector("span.instancename");
        if (!span) return null;
        const accesshide = span.querySelector(".accesshide");
        const text = accesshide
          ? span.textContent!.replace(accesshide.textContent!, "").trim()
          : span.textContent?.trim() ?? "";
        return { name: text, url: (a as HTMLAnchorElement).href };
      })
      .filter((x): x is { name: string; url: string } => x !== null),
  );
  return all.filter((x) => RUBRIK_RE.test(x.name));
}

/**
 * Scrapes every "Rubrik …" resource in the course section that holds this forum
 * and caches it under .rubrik-files/{credentialId}/{forumId}/.
 */
export async function scrapeRubrikDiskusi(
  page: Page,
  sectionUrl: string,
  credentialId: string,
  forumId: string,
): Promise<RubrikFile[]> {
  logger.info(`Opening section page for rubrik scrape: ${sectionUrl}`);
  await page.goto(sectionUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".activityname", { timeout: 15000 }).catch(() => {
    logger.warn("No activities found on section page");
  });

  const activities = await findRubrikActivities(page);
  logger.info(`Found ${activities.length} rubrik activit${activities.length === 1 ? "y" : "ies"}`);
  if (activities.length === 0) return [];

  const dir = path.join(RUBRIK_FILES_BASE, credentialId, forumId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  const now = new Date().toISOString();
  const files: RubrikFile[] = [];
  for (const act of activities) {
    const downloaded = await downloadResource(page, act.url, dir, act.name, {
      convertOffice: true,
      relativeTo: RUBRIK_FILES_BASE,
    });
    if (!downloaded) continue;
    files.push({
      name: act.name,
      url: act.url,
      filename: downloaded.filename,
      localPath: downloaded.localPath,
      collectedAt: now,
    });
  }

  logger.ok(`Collected ${files.length} rubrik file(s)`);
  return files;
}
