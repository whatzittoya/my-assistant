import type { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/lib/activity-log";
import { OFFICE_EXTS, convertToPdf } from "@/lib/pdf-convert";
import type { TugasFile, TugasSubmission } from "@/types";

const FILES_BASE = path.join(process.cwd(), ".tugas-files");

export type TugasCollectScope = "all" | "requiresGrading";

const FILTER_VALUE: Record<TugasCollectScope, string> = {
  all: "submitted",
  requiresGrading: "requiregrading",
};

function sanitizeForFolder(s: string): string {
  return s
    .replace(/[\/\\:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function buildAssignFolderName(
  assignId: string,
  courseName?: string | null,
  tugasName?: string | null,
): string {
  const parts = [assignId];
  if (courseName) parts.push(sanitizeForFolder(courseName));
  if (tugasName) parts.push(sanitizeForFolder(tugasName));
  return parts.join(" - ");
}

export function findAssignDir(credentialId: string, assignId: string): string | null {
  const base = path.join(FILES_BASE, credentialId);
  if (!fs.existsSync(base)) return null;
  const exact = path.join(base, assignId);
  if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) return exact;
  const prefix = `${assignId} - `;
  const entries = fs.readdirSync(base, { withFileTypes: true });
  const hit = entries.find((e) => e.isDirectory() && e.name.startsWith(prefix));
  return hit ? path.join(base, hit.name) : null;
}

async function downloadFile(
  page: Page,
  url: string,
  credentialId: string,
  folderName: string,
  filename: string,
  userId: string,
): Promise<string | null> {
  try {
    const response = await page.context().request.get(url);
    if (!response.ok()) {
      logger.warn(`Download failed (${response.status()}): ${filename}`);
      return null;
    }
    const dir = path.join(FILES_BASE, credentialId, folderName);
    fs.mkdirSync(dir, { recursive: true });

    const prefixedFilename = `${userId}_${filename}`;
    const rawPath = path.join(dir, prefixedFilename);
    fs.writeFileSync(rawPath, await response.body());
    logger.ok(`Downloaded: ${prefixedFilename}`);

    // Convert Office files to PDF immediately so they're viewable
    const ext = path.extname(filename).toLowerCase();
    if (OFFICE_EXTS.has(ext)) {
      try {
        const pdfPath = convertToPdf(rawPath);
        fs.unlinkSync(rawPath);
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

// Full text of a feedback comment that the grading table truncates. Fetched
// inside the page so the logged-in session cookies are used.
async function fetchFullFeedback(page: Page, url: string): Promise<string | null> {
  try {
    const text = await page.evaluate(async (u) => {
      const res = await fetch(u, { credentials: "include" });
      if (!res.ok) return null;
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const main = doc.querySelector("#region-main") ?? doc.body;
      main.querySelectorAll("script, style, nav, .breadcrumb, h2, .accesshide").forEach((e) => e.remove());
      const html = main.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "</$1>\n");
      const d = document.createElement("div");
      d.innerHTML = html;
      return (d.textContent ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    }, url);
    return text || null;
  } catch (e) {
    logger.warn(`Full feedback fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function scrapeTugasSubmissions(
  page: Page,
  assignId: string,
  credentialId: string,
  downloadFiles = true,
  collectScope: TugasCollectScope = "all",
  folderName: string = assignId,
): Promise<Omit<TugasSubmission, "collectedAt">[]> {
  if (downloadFiles && collectScope === "all") {
    // Full download refresh replaces the assignment's local cache.
    // Partial refreshes keep existing files for students outside the filter.
    // Clear both the new-format dir and any legacy bare-assignId dir.
    const candidates = new Set<string>([
      path.join(FILES_BASE, credentialId, folderName),
      path.join(FILES_BASE, credentialId, assignId),
    ]);
    const existing = findAssignDir(credentialId, assignId);
    if (existing) candidates.add(existing);
    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        logger.info(`Cleared old files: ${dir}`);
      }
    }
  }

  const gradingUrl = `https://elearning.ut.ac.id/mod/assign/view.php?id=${assignId}&action=grading`;
  logger.info(`Navigating to grading page: ${gradingUrl}`);
  await page.goto(gradingUrl, { waitUntil: "networkidle", timeout: 60000 });

  // Set perpage = All (-1) — triggers auto-submit via onchange
  logger.info("Setting perpage=All");
  await page.waitForSelector("#id_perpage", { timeout: 30000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 60000 }),
    page.selectOption("#id_perpage", "-1"),
  ]);

  // Set grading table filter.
  const filterValue = FILTER_VALUE[collectScope];
  logger.info(`Setting filter=${filterValue}`);
  await page.waitForSelector("#id_filter", { timeout: 30000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 60000 }),
    page.selectOption("#id_filter", filterValue),
  ]);

  // Wait for table rows to be present (not just the table shell)
  const tableExists = await page
    .waitForSelector("table.flexible tbody tr[id^='mod_assign_grading-']", { timeout: 30000 })
    .then(() => true)
    .catch(() => false);

  if (!tableExists) {
    logger.warn("Grading table not found — no submissions?");
    return [];
  }

  await page.waitForTimeout(800);

  const rows = await page.$$("table.flexible tbody tr[id^='mod_assign_grading-']");
  logger.info(`Found ${rows.length} rows`);

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

    // grade from c5 — strip button/image text. In quick-grading (edit) mode the
    // grade is an <input class="quickgrade">, so swap it for its value first.
    const grade = await row
      .$eval(".cell.c5", (el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("input.quickgrade").forEach((inp) => {
          inp.replaceWith((inp as HTMLInputElement).value);
        });
        clone.querySelectorAll("a, img, br, label, .accesshide").forEach((e) => e.remove());
        const t = clone.textContent?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() ?? "";
        return t === "-" || t === "" || t.startsWith("/") ? null : t;
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

    // feedbackComment from c10. Quick-grading (edit) mode holds the full comment
    // as HTML in a <textarea class="quickgrade">; otherwise the cell shows a
    // truncated preview ending in "..." plus a link to the full comment.
    const feedbackCell = await row
      .$eval(".cell.c10", (el) => {
        const toText = (html: string) => {
          const d = document.createElement("div");
          d.innerHTML = html
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|div|li)>/gi, "</$1>\n");
          return (d.textContent ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
        };
        const ta = el.querySelector("textarea.quickgrade") as HTMLTextAreaElement | null;
        if (ta) return { text: toText(ta.value), full: true, href: "" };
        const clone = el.cloneNode(true) as HTMLElement;
        const href =
          (el.querySelector('a[href*="viewpluginassignfeedback"]') as HTMLAnchorElement | null)?.href ?? "";
        clone.querySelectorAll("a, img, label, .accesshide").forEach((e) => e.remove());
        const text = (clone.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        return { text, full: false, href };
      })
      .catch(() => ({ text: "", full: true, href: "" }));
    let feedbackComment = feedbackCell.text;
    if (!feedbackCell.full && feedbackCell.href && /(\.\.\.|…)$/.test(feedbackComment)) {
      feedbackComment = (await fetchFullFeedback(page, feedbackCell.href)) ?? feedbackComment;
    }

    // finalGrade from c11 — e.g. "87.00 / 100.00" → 87, or "-" → null
    const finalGrade = await row
      .$eval(".cell.c11", (el) => {
        const t = el.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
        if (t === "-" || t === "") return null;
        const num = parseFloat(t.split("/")[0].trim());
        return isNaN(num) ? null : num;
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

    // Download each file (skipped if downloadFiles=false)
    const files: TugasFile[] = [];
    for (const rf of rawFiles) {
      if (!rf.url || !rf.filename) continue;
      const localPath = downloadFiles
        ? await downloadFile(page, rf.url, credentialId, folderName, rf.filename, userId)
        : null;
      const filename = localPath ? path.basename(localPath) : rf.filename;
      files.push({ filename, url: rf.url, submittedAt: rf.submittedAt, localPath });
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
