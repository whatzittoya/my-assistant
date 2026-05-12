import type { Page } from "playwright";
import type { GradebookItem, GradebookSnapshot, GradebookStudentGrade } from "@/types";
import {
  activityIdFromUrl,
  classifyGradebookItem,
  normalizeGradeValue,
  normalizeHtmlFeedback,
  extractStudentNo,
  studentNoFromEmail,
} from "@/lib/gradebook-utils";
import { logger } from "@/lib/activity-log";

type RawHeader = {
  itemId: string;
  name: string;
  url: string;
};

type RawStudent = {
  uid: string;
  name: string;
  email: string;
  grades: GradebookStudentGrade[];
};

export async function scrapeGradebook(page: Page, courseId: string): Promise<GradebookSnapshot> {
  const sourceUrl = `https://elearning.ut.ac.id/grade/report/grader/index.php?id=${courseId}`;
  logger.info(`Navigating to gradebook: ${sourceUrl}`);
  await page.goto(sourceUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("#user-grades tr.heading [data-itemid]", { timeout: 30000 });

  const raw = await page.evaluate(() => {
    const table = document.querySelector("#user-grades");
    if (!table) return { headers: [] as RawHeader[], students: [] as RawStudent[] };

    const headers = Array.from(table.querySelectorAll("tr.heading [data-itemid]")).map((cell) => {
      const itemId = cell.getAttribute("data-itemid") ?? "";
      const header = cell.querySelector(".gradeitemheader");
      const name = header?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const link = header?.closest("a") as HTMLAnchorElement | null;
      return { itemId, name, url: link?.href ?? "" };
    });

    const students = Array.from(table.querySelectorAll("tr.userrow")).map((row) => {
      const uid = (row as HTMLElement).dataset.uid ?? "";
      const username = row.querySelector("a.username");
      const clone = username?.cloneNode(true) as HTMLElement | undefined;
      clone?.querySelectorAll("img, span.userinitials").forEach((node) => node.remove());
      const name = clone?.textContent?.replace(/\s+/g, " ").trim() ?? username?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const email = row.querySelector("td.useremail")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const grades = Array.from(row.querySelectorAll("td.grade[data-itemid]")).map((cell) => ({
        itemId: cell.getAttribute("data-itemid") ?? "",
        value: cell.querySelector(".gradevalue")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        feedback: (cell as HTMLElement).dataset.feedback ?? null,
      }));
      return { uid, name, email, grades };
    });

    return { headers, students };
  });

  const items: GradebookItem[] = raw.headers.flatMap((header) => {
    const kind = classifyGradebookItem(header.name, header.url);
    if (!kind) return [];
    const activityId = activityIdFromUrl(kind, header.url);
    if (!activityId) return [];
    return [{
      itemId: header.itemId,
      kind,
      name: header.name,
      url: header.url,
      activityId,
    }];
  });

  const keepIds = new Set(items.map((item) => item.itemId));
  const students = raw.students.map((student) => ({
    uid: student.uid,
    name: student.name,
    email: student.email,
    studentNo: studentNoFromEmail(student.email) ?? extractStudentNo(student.name),
    grades: student.grades
      .filter((grade) => keepIds.has(grade.itemId))
      .map((grade) => ({
        itemId: grade.itemId,
        value: normalizeGradeValue(grade.value),
        feedback: normalizeHtmlFeedback(grade.feedback),
      })),
  }));

  logger.ok(`Gradebook collected: ${items.length} items, ${students.length} students`);
  return {
    courseId,
    sourceUrl,
    items,
    students,
    collectedAt: new Date().toISOString(),
  };
}
