import type { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/lib/activity-log";
import { downloadResource } from "@/lib/playwright/download";
import { scrapeLevel0Tabs, cleanTabName } from "@/lib/playwright/ut-sessions";
import { reauthenticate } from "@/lib/playwright/session";
import { sessionDirName } from "@/lib/materi";
import type { CollectedSession } from "@/types";

/** Raw activity as read off the section page, before we fetch anything. */
type RawActivity = {
  mod: string;
  name: string;
  url: string;
  html: string;
  text: string;
  embeds: string[];
};

/** Reads the section summary and every activity, in page order. */
async function readSection(
  page: Page,
): Promise<{ summaryHtml: string; summaryEmbeds: string[]; raw: RawActivity[] }> {
  return page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s ?? "").trim();

    /**
     * Files embedded inside the HTML rather than attached as an activity:
     * iframes (Office viewer, Google Drive preview, direct PDFs) and links
     * straight to a document. Plain hyperlinks are left alone.
     */
    const DOC_EXT = /\.(pdf|docx?|pptx?|xlsx?|zip)(\?|$)/i;
    const embedsIn = (root: Element | null | undefined): string[] => {
      if (!root) return [];
      const found: string[] = [];
      root.querySelectorAll("iframe[src], embed[src], object[data]").forEach((el) => {
        const src = el.getAttribute("src") ?? el.getAttribute("data") ?? "";
        if (/^https?:\/\//i.test(src)) found.push(src);
      });
      root.querySelectorAll("a[href]").forEach((el) => {
        const href = (el as HTMLAnchorElement).href;
        if (/^https?:\/\//i.test(href) && (DOC_EXT.test(href) || href.includes("pluginfile.php"))) {
          found.push(href);
        }
      });
      return Array.from(new Set(found));
    };

    const summaryEl = document.querySelector(
      ".course-content .summarytext .no-overflow, .course-content .summarytext",
    );

    const raw = Array.from(document.querySelectorAll("li.activity, div.activity"))
      .map((li) => {
        const mod = (li.className.match(/modtype_(\w+)/) ?? [])[1] ?? "";
        if (!mod) return null;

        const span = li.querySelector("span.instancename");
        let name = "";
        if (span) {
          const accesshide = span.querySelector(".accesshide");
          name = accesshide
            ? clean(span.textContent?.replace(accesshide.textContent ?? "", ""))
            : clean(span.textContent);
        }

        const a = li.querySelector("a.aalink, a.stretched-link") as HTMLAnchorElement | null;
        const content = li.querySelector(
          "div.activity-altcontent div.no-overflow, div.activity-altcontent",
        );

        return {
          mod,
          name,
          url: a?.href ?? "",
          html: content?.innerHTML ?? "",
          text: clean(content?.textContent),
          embeds: embedsIn(content),
        };
      })
      .filter((x): x is RawActivity => x !== null);

    return {
      summaryHtml: summaryEl?.innerHTML ?? "",
      summaryEmbeds: embedsIn(summaryEl),
      raw,
    };
  });
}

const DOC_EXT_RE = /\.(pdf|docx?|pptx?|xlsx?|zip)(\?|$)/i;

/**
 * Turns an embed URL into something downloadable.
 *
 * UT tutors embed material three ways: a direct file on their Azure CDN, the
 * Office web viewer wrapping a CDN file, and a Google Drive preview. Each has a
 * plain-file form. Google Slides `pubembed` decks and YouTube have none, so
 * they stay links.
 */
function resolveEmbed(src: string): string | null {
  // Office web viewer: the real file is url-encoded in ?src=
  const office = src.match(/view\.officeapps\.live\.com\/op\/(?:embed|view)\.aspx\?src=([^&]+)/i);
  if (office) {
    try {
      return decodeURIComponent(office[1]);
    } catch {
      return null;
    }
  }

  // Google Drive preview → direct download
  const drive = src.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;

  // Published Google Slides and video embeds cannot be exported — keep as links.
  if (/docs\.google\.com|youtube\.com|youtu\.be|vimeo\.com/i.test(src)) return null;

  return DOC_EXT_RE.test(src) || src.includes("pluginfile.php") ? src : null;
}

/** MS Teams blocks render their schedule as plain text lines. */
function parseWebinar(text: string): {
  subject?: string;
  start?: string;
  end?: string;
  timezone?: string;
  joinUrl?: string;
} {
  const pick = (label: string) =>
    text.match(new RegExp(`${label}:\\s*(.+)`, "i"))?.[1]?.trim() || undefined;
  return {
    subject: pick("Subject"),
    start: pick("Start"),
    end: pick("End"),
    timezone: pick("Timezone"),
    joinUrl: text.match(/https:\/\/teams\.microsoft\.com\/\S+/)?.[0],
  };
}

/** Opens an assign/forum page and returns its intro HTML (+ due date for assign). */
async function readModIntro(
  page: Page,
  url: string,
): Promise<{ html: string; dueDate?: string }> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#region-main", { timeout: 10000 }).catch(() => {});
  return page.evaluate(() => {
    // UT's theme renders the activity intro inside the header block, not #intro.
    const intro = document.querySelector(
      ".activity-header .no-overflow, #intro .no-overflow, #region-main .no-overflow",
    );
    // Moodle renders assignment dates in an "Opened/Due" table or activity-dates block.
    const dates = document.querySelector('[data-region="activity-dates"], .activity-dates');
    const due = dates?.textContent?.match(/(?:Due|Batas|Tenggat)[^:]*:\s*([^\n]+)/i)?.[1];
    return { html: intro?.innerHTML ?? "", dueDate: due?.trim() || undefined };
  });
}

/** Resolves a mod/url activity to its external target without following it. */
async function resolveUrlTarget(page: Page, url: string): Promise<string> {
  try {
    const res = await page.context().request.get(url, { maxRedirects: 0 });
    const location = res.headers()["location"];
    if (location) return location;
  } catch {
    // fall through to the page-render path
  }
  // Non-redirecting display modes (embed / "open in a new window") render the
  // target as a link on the page instead of 303-ing to it.
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return await page.evaluate(() => {
      const a = document.querySelector<HTMLAnchorElement>(
        "#region-main a[href^='http']:not([href*='elearning.ut.ac.id'])",
      );
      const iframe = document.querySelector<HTMLIFrameElement>("#resourceobject, iframe[src^='http']");
      return a?.href ?? iframe?.src ?? "";
    });
  } catch {
    return "";
  }
}

/**
 * Walks every session tab of a course, writing each section's instruction and
 * files into `outDir/<NN - Session Name>/`.
 *
 * Caller must hold the credential lock and pass an already-logged-in page.
 */
export async function collectCourseMaterial(
  page: Page,
  courseUrl: string,
  outDir: string,
  credentialId: string,
): Promise<CollectedSession[]> {
  let current = page;

  /**
   * Navigate, recovering once if UT has expired the session underneath us —
   * a full course crawl takes minutes and Moodle will log us out mid-run.
   */
  const open = async (url: string): Promise<void> => {
    await current.goto(url, { waitUntil: "domcontentloaded" });
    if (!current.url().includes("/login/")) return;

    logger.warn("UT session expired mid-collect — logging in again");
    const s = await reauthenticate(credentialId);
    current = s.page;
    await current.goto(url, { waitUntil: "domcontentloaded" });
    if (current.url().includes("/login/")) {
      throw new Error("UT session expired and re-login did not take");
    }
  };

  logger.info("Opening course page for material collection");
  await open(courseUrl);
  await current
    .waitForSelector(".format_onetopic-tabs", { timeout: 15000 })
    .catch(() => logger.warn("Tab wrapper not found — collecting the single page"));

  const tabs = await scrapeLevel0Tabs(current);
  // Unlike scrapeSessions we keep every tab, Pendahuluan included — it is material too.
  const targets =
    tabs.length > 0
      ? tabs
      : [{ name: "Course", url: courseUrl, hasChilds: false, section: "0" }];

  logger.info(`Collecting ${targets.length} section(s) into ${path.basename(outDir)}`);

  // A full run replaces whatever was collected before.
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const sessions: CollectedSession[] = [];

  for (let i = 0; i < targets.length; i++) {
    const tab = targets[i];
    const name = cleanTabName(tab.name) || `Sesi ${i + 1}`;
    const dirName = sessionDirName(tab.section, name);
    const dir = path.join(outDir, dirName);
    const filesDir = path.join(dir, "files");

    logger.info(`[${i + 1}/${targets.length}] ${name}`);

    const session: CollectedSession = {
      section: tab.section,
      name,
      url: tab.url,
      summaryHtml: "",
      activities: [],
      dirName,
    };

    try {
      await open(tab.url);
      await current.waitForSelector(".course-content", { timeout: 15000 }).catch(() => {});
      await current
        .waitForSelector(".course-content .summarytext", { timeout: 5000 })
        .catch(() => {});

      const { summaryHtml, summaryEmbeds, raw } = await readSection(current);
      session.summaryHtml = summaryHtml;

      // The same file is often embedded more than once in a section.
      const seenEmbeds = new Set<string>();

      const collectEmbeds = async (srcs: string[]) => {
        for (const src of srcs) {
          if (seenEmbeds.has(src)) continue;
          seenEmbeds.add(src);

          const fileUrl = resolveEmbed(src);
          if (!fileUrl) {
            session.activities.push({
              kind: "link",
              name: "Embed",
              url: src,
              target: src,
            });
            continue;
          }
          // Only a *different* resolved URL needs its own dedupe entry; a direct
          // file link resolves to itself and was already recorded above.
          if (fileUrl !== src) {
            if (seenEmbeds.has(fileUrl)) continue;
            seenEmbeds.add(fileUrl);
          }

          const dl = await downloadResource(current, fileUrl, filesDir, src, { relativeTo: dir });
          if (dl) {
            session.activities.push({
              kind: "file",
              name: dl.filename.replace(/\.[^.]+$/, ""),
              url: fileUrl,
              filename: dl.filename,
              localPath: dl.localPath,
            });
          }
        }
      };

      await collectEmbeds(summaryEmbeds);

      for (const act of raw) {
        try {
          switch (act.mod) {
            case "label": {
              // Empty labels are decorative banner images — nothing to learn from.
              if (act.text) session.activities.push({ kind: "text", html: act.html });
              break;
            }
            case "resource":
            case "folder": {
              const dl = await downloadResource(current, act.url, filesDir, act.name, {
                relativeTo: dir,
              });
              if (dl) {
                session.activities.push({
                  kind: "file",
                  name: act.name,
                  url: act.url,
                  filename: dl.filename,
                  localPath: dl.localPath,
                });
              }
              break;
            }
            case "url": {
              const target = await resolveUrlTarget(current, act.url);
              session.activities.push({ kind: "link", name: act.name, url: act.url, target });
              break;
            }
            case "assign": {
              const { html, dueDate } = await readModIntro(current, act.url);
              session.activities.push({ kind: "assign", name: act.name, url: act.url, html, dueDate });
              break;
            }
            case "forum": {
              const { html } = await readModIntro(current, act.url);
              session.activities.push({ kind: "forum", name: act.name, url: act.url, html });
              break;
            }
            case "msteams": {
              session.activities.push({
                kind: "webinar",
                name: act.name,
                url: act.url,
                ...parseWebinar(act.text),
              });
              break;
            }
            default:
              session.activities.push({ kind: "other", mod: act.mod, name: act.name, url: act.url });
          }
          await collectEmbeds(act.embeds);
        } catch (e) {
          // One awkward activity shouldn't cost us the rest of the section.
          const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
          logger.warn(`  skipped ${act.mod} "${act.name}": ${msg}`);
        }
      }

      const fileCount = session.activities.filter((a) => a.kind === "file").length;
      logger.ok(`  ${name}: ${session.activities.length} item(s), ${fileCount} file(s)`);
    } catch (err) {
      // One broken section shouldn't abort the rest of the course.
      session.error = err instanceof Error ? err.message : String(err);
      logger.err(`  ${name}: ${session.error}`);
    }

    sessions.push(session);
  }

  logger.ok(`Collected ${sessions.length} section(s)`);
  return sessions;
}
