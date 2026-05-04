import type { Page } from "playwright";
import { logger } from "@/lib/activity-log";

export type GradeItem = {
  userId: string;
  score: number;
  feedback: string;
};

export type GradeResult = {
  userId: string;
  status: "ok" | "skipped" | "error";
  error?: string;
};

export async function postTugasGrades(
  page: Page,
  assignId: string,
  grades: GradeItem[],
): Promise<{ results: GradeResult[]; saved: boolean }> {
  const gradingUrl = `https://elearning.ut.ac.id/mod/assign/view.php?id=${assignId}&action=grading`;
  logger.info(`Navigating to grading page: ${gradingUrl}`);
  await page.goto(gradingUrl, { waitUntil: "domcontentloaded" });

  // Perpage = All
  logger.info("Setting perpage=All");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.selectOption("#id_perpage", "-1"),
  ]);

  // Filter = submitted
  logger.info("Setting filter=submitted");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.selectOption("#id_filter", "submitted"),
  ]);

  // Enable quick grading if not already checked
  const isChecked = await page.$eval(
    "#id_quickgrading",
    (el) => (el as HTMLInputElement).checked,
  ).catch(() => false);

  if (!isChecked) {
    logger.info("Enabling quick grading");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
      page.click("#id_quickgrading"),
    ]);
  }

  await page.waitForSelector("table.flexible", { timeout: 20000 });
  await page.waitForTimeout(500);

  const results: GradeResult[] = [];

  for (const { userId, score, feedback } of grades) {
    try {
      // Locate the row by the hidden user checkbox
      const row = await page.$(`tr:has(input[name="selectedusers"][value="${userId}"])`);
      if (!row) {
        logger.warn(`Row not found for userId=${userId}`);
        results.push({ userId, status: "skipped", error: "Row not found on page" });
        continue;
      }

      // Grade input — quick grading puts a text input in the grade cell (c5)
      const gradeInput = await row.$('td.c5 input[type="text"], td.c5 input[type="number"], input[name="quickgrade[' + userId + ']"]');
      if (gradeInput) {
        await gradeInput.fill(String(score));
        logger.info(`Set grade ${score} for userId=${userId}`);
      } else {
        logger.warn(`Grade input not found for userId=${userId}`);
      }

      // Feedback textarea — in feedback comments cell (c10)
      const feedbackArea = await row.$('td.c10 textarea, textarea[name="quickfeedbackcomments[' + userId + ']"]');
      if (feedbackArea) {
        await feedbackArea.fill(feedback);
        logger.info(`Set feedback for userId=${userId}`);
      } else {
        logger.warn(`Feedback textarea not found for userId=${userId}`);
      }

      results.push({ userId, status: "ok" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.err(`Error grading userId=${userId}: ${msg}`);
      results.push({ userId, status: "error", error: msg });
    }
  }

  // Save all quick grading
  const saveBtn = await page.$("#id_savequickgrades");
  if (!saveBtn) {
    logger.err("Save button not found");
    return { results, saved: false };
  }

  logger.info("Clicking Save all quick grading changes");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    saveBtn.click(),
  ]);

  logger.ok("Grades saved");
  return { results, saved: true };
}
