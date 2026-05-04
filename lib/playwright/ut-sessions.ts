import { Page } from "playwright";
import type { Session, SessionActivity } from "@/types";
import { logger } from "@/lib/activity-log";

function sectionFromUrl(url: string): string {
  const m = url.match(/[?&]section=(\d+)/);
  return m ? m[1] : url;
}

function cleanTabName(title: string): string {
  // Strip " Hidden from students" suffix
  return title.replace(/:\s*hidden from students/i, "").trim();
}

async function findActivitiesOnPage(
  page: Page,
): Promise<{ diskusi: SessionActivity[]; tugas: SessionActivity[] }> {
  const all = await page.$$eval(".activityname a.aalink", (els) => {
    return els
      .map((a) => {
        const span = a.querySelector("span.instancename");
        if (!span) return null;
        const accesshide = span.querySelector(".accesshide");
        const text = accesshide
          ? span.textContent!.replace(accesshide.textContent!, "").trim()
          : span.textContent?.trim() ?? "";
        return { name: text, url: (a as HTMLAnchorElement).href };
      })
      .filter((x): x is { name: string; url: string } => x !== null);
  });

  return {
    diskusi: all.filter((x) => /^diskusi\s+\d+/i.test(x.name)),
    tugas: all.filter((x) => /^tugas[\s.]\d+/i.test(x.name)),
  };
}

interface TabInfo {
  name: string;
  url: string;
  hasChilds: boolean;
  section: string;
}

async function scrapeLevel0Tabs(page: Page): Promise<TabInfo[]> {
  return page.$$eval(
    ".format_onetopic-tabs li.tab_level_0",
    (items) =>
      items.map((li) => {
        const a = li.querySelector("a.nav-link") as HTMLAnchorElement | null;
        const title = a?.getAttribute("title") ?? a?.textContent?.trim() ?? "";
        const url = a?.href ?? "";
        const hasChilds = li.classList.contains("haschilds");
        const m = url.match(/[?&]section=(\d+)/);
        const section = m ? m[1] : url;
        return { name: title, url, hasChilds, section };
      }),
  );
}

async function scrapeLevel1Tabs(page: Page): Promise<TabInfo[]> {
  return page.$$eval(
    ".format_onetopic-tabs li.tab_level_1",
    (items) =>
      items.map((li) => {
        const a = li.querySelector("a.nav-link") as HTMLAnchorElement | null;
        const title = a?.getAttribute("title") ?? a?.textContent?.trim() ?? "";
        const url = a?.href ?? "";
        const m = url.match(/[?&]section=(\d+)/);
        const section = m ? m[1] : url;
        return { name: title, url, hasChilds: false, section };
      }),
  );
}

export async function scrapeSessions(page: Page, courseUrl: string): Promise<Session[]> {
  logger.info("Opening course page for session scrape");
  await page.goto(courseUrl, { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector(".format_onetopic-tabs", { timeout: 15000 })
    .catch(() => logger.warn("Tab wrapper not found"));

  const level0Tabs = await scrapeLevel0Tabs(page);
  // Skip tabs named Pendahuluan (intro)
  const sessionTabs = level0Tabs.filter(
    (t) => !/^pendahuluan$/i.test(cleanTabName(t.name)),
  );
  logger.info(`Found ${sessionTabs.length} session tabs`);

  const results: Session[] = [];
  const now = new Date().toISOString();

  for (const tab of sessionTabs) {
    const parentName = cleanTabName(tab.name);
    logger.info(`Navigating to tab: ${parentName}`);

    await page.goto(tab.url, { waitUntil: "domcontentloaded" });
    await page
      .waitForSelector(".format_onetopic-tabs", { timeout: 10000 })
      .catch(() => {});

    if (tab.hasChilds) {
      // Scrape child tabs
      const childTabs = await scrapeLevel1Tabs(page);

      if (childTabs.length > 0) {
        logger.info(`  ${childTabs.length} child tabs under ${parentName}`);
        for (const child of childTabs) {
          const childName = cleanTabName(child.name);
          const flatName = `${parentName} - ${childName}`;
          const sessionId = child.section;

          logger.info(`  Navigating child: ${flatName}`);
          await page.goto(child.url, { waitUntil: "domcontentloaded" });
          await page
            .waitForSelector(".activityname", { timeout: 8000 })
            .catch(() => {});

          const { diskusi, tugas } = await findActivitiesOnPage(page);
          logger.info(`    Found ${diskusi.length} diskusi, ${tugas.length} tugas`);

          results.push({
            id: sessionId,
            name: flatName,
            url: child.url,
            diskusi,
            tugas,
            collectedAt: now,
          });
        }
      } else {
        // haschilds but no level-1 found — treat as normal tab
        const { diskusi, tugas } = await findActivitiesOnPage(page);
        results.push({
          id: tab.section,
          name: parentName,
          url: tab.url,
          diskusi,
          tugas,
          collectedAt: now,
        });
      }
    } else {
      await page
        .waitForSelector(".activityname", { timeout: 8000 })
        .catch(() => {});
      const { diskusi, tugas } = await findActivitiesOnPage(page);
      logger.info(`  Found ${diskusi.length} diskusi, ${tugas.length} tugas in ${parentName}`);

      results.push({
        id: tab.section,
        name: parentName,
        url: tab.url,
        diskusi,
        tugas,
        collectedAt: now,
      });
    }
  }

  logger.ok(`Collected ${results.length} sessions total`);
  return results;
}
