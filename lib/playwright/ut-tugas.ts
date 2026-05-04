import type { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/lib/activity-log";
import { OFFICE_EXTS, convertToPdf } from "@/lib/pdf-convert";
import type { TugasFile, TugasSubmission } from "@/types";

const FILES_BASE = path.join(process.cwd(), ".tugas-files");

async function downloadFile(
  page: Page,
  url: string,
  credentialId: string,
  assignId: string,
  filename: string,
): Promise<string | null> {
  try {
    const response = await page.context().request.get(url);
    if (!response.ok()) {
      logger.warn(`Download failed (${response.status()}): ${filename}`);
      return null;
    }
    const dir = path.join(FILES_BASE, credentialId, assignId);
    fs.mkdirSync(dir, { recursive: true });

    const rawPath = path.join(dir, filename);
    fs.writeFileSync(rawPath, await response.body());
    logger.ok(`Downloaded: ${filename}`);

    // Convert Office files to PDF immediately so they're viewable
    const ext = path.extname(filename).toLowerCase();
    if (OFFICE_EXTS.has(ext)) {
      try {
        const pdfPath = convertToPdf(rawPath);
        return path.relative(FILES_BASE, pdfPath);
      } catch (e) {
        logger.warn(`PDF conversion failed, keeping original: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return path.relative(FILES_BASE, rawPath);
  } catch (e) {
    logger.warn(`Download error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function scrapeTugasSubmissions(
  page: Page,
  assignId: string,
  credentialId: string,
): Promise<Omit<TugasSubmission, "collectedAt">[]> {
  const gradingUrl = `https://elearning.ut.ac.id/mod/assign/view.php?id=${assignId}&action=grading`;
  logger.info(`Navigating to grading page: ${gradingUrl}`);
  await page.goto(gradingUrl, { waitUntil: "domcontentloaded" });

  // Set perpage = All (-1) — triggers auto-submit via onchange
  logger.info("Setting perpage=All");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.selectOption("#id_perpage", "-1"),
  ]);

  // Set filter = submitted
  logger.info("Setting filter=submitted");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.selectOption("#id_filter", "submitted"),
  ]);

  // Wait for table
  const tableExists = await page
    .waitForSelector("table.flexible.table", { timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  if (!tableExists) {
    logger.warn("Grading table not found — no submissions?");
    return [];
  }

  await page.waitForTimeout(500);

  const rows = await page.$$("table.flexible tbody tr[id^='mod_assign_grading-']");
  logger.info(`Found ${rows.length} submitted rows`);

  const submissions: Omit<TugasSubmission, "collectedAt">[] = [];

  for (const row of rows) {
    // userId from checkbox
    const userId = await row
      .$eval('input[name="selectedusers"]', (el) => (el as HTMLInputElement).value)
      .catch(() => "");
    if (!userId) continue;

    // name from c2
    const name = await row
      .$eval(".cell.c2", (el) => el.textContent?.trim() ?? "")
      .catch(() => "");

    // email from c3
    const email = await row
      .$eval(".cell.c3", (el) => el.textContent?.trim() ?? "")
      .catch(() => "");

    // status from c4
    const status = await row
      .$eval(".cell.c4", (el) => el.textContent?.trim() ?? "")
      .catch(() => "");

    // grade from c5 — strip button/image text
    const grade = await row
      .$eval(".cell.c5", (el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("a, img, br").forEach((e) => e.remove());
        const t = clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return t === "-" || t === "" ? null : t;
      })
      .catch(() => null);

    // lastModifiedSubmission from c7
    const lastModifiedSubmission = await row
      .$eval(".cell.c7", (el) => el.textContent?.trim() ?? "")
      .catch(() => "");

    // lastModifiedGrade from c9
    const lastModifiedGrade = await row
      .$eval(".cell.c9", (el) => {
        const t = el.textContent?.trim() ?? "";
        return t === "-" || t === "" ? null : t;
      })
      .catch(() => null);

    // feedbackComment from c10
    const feedbackComment = await row
      .$eval(".cell.c10", (el) => el.textContent?.trim() ?? "")
      .catch(() => "");

    // finalGrade from c11
    const finalGrade = await row
      .$eval(".cell.c11", (el) => {
        const t = el.textContent?.trim() ?? "";
        return t === "-" || t === "" ? null : t;
      })
      .catch(() => null);

    // files from c8 — extract all fileuploadsubmission links
    const rawFiles = await row
      .$eval(".cell.c8", (cell) => {
        const result: { filename: string; url: string; submittedAt: string }[] = [];
        const subs = cell.querySelectorAll(".fileuploadsubmission");
        for (const sub of subs) {
          const anchor = sub.querySelector("a");
          const timeEl = sub.parentElement?.querySelector(".fileuploadsubmissiontime");
          result.push({
            filename: anchor?.textContent?.trim() ?? "",
            url: anchor?.href ?? "",
            submittedAt: timeEl?.textContent?.trim() ?? "",
          });
        }
        return result;
      })
      .catch(() => [] as { filename: string; url: string; submittedAt: string }[]);

    // Download each file
    const files: TugasFile[] = [];
    for (const rf of rawFiles) {
      if (!rf.url || !rf.filename) continue;
      const localPath = await downloadFile(page, rf.url, credentialId, assignId, rf.filename);
      files.push({ filename: rf.filename, url: rf.url, submittedAt: rf.submittedAt, localPath });
    }

    logger.ok(`${name}: ${files.length} file(s)`);
    submissions.push({
      userId,
      name,
      email,
      status,
      grade,
      lastModifiedSubmission,
      lastModifiedGrade,
      feedbackComment,
      finalGrade,
      files,
    });
  }

  return submissions;
}
