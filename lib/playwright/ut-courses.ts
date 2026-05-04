import { Page } from "playwright";
import type { Course } from "@/types";
import { logger } from "@/lib/activity-log";

const COURSES_URL = "https://elearning.ut.ac.id/my/courses.php";

export async function collectCourses(page: Page): Promise<Course[]> {
  logger.info("Navigating to course list page");
  await page.goto(COURSES_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("a.aalink.coursename", { timeout: 15000 }).catch(() => {
    logger.warn("Course selector timeout — page may be empty");
  });

  const raw = await page.$$eval("a.aalink.coursename", (els) =>
    els.map((a) => {
      const anchor = a as HTMLAnchorElement;
      const name = anchor.querySelector("span.multiline")?.textContent?.trim() ?? "";
      return { url: anchor.href, name };
    }),
  );

  const now = new Date().toISOString();
  const courses = raw
    .filter((r) => r.url && r.name)
    .map((r) => {
      const m = r.url.match(/[?&]id=(\d+)/);
      return { courseId: m ? m[1] : r.url, name: r.name, url: r.url, collectedAt: now };
    });

  logger.ok(`Found ${courses.length} courses`);
  return courses;
}
