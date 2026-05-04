import { Page } from "playwright";
import { logger } from "@/lib/activity-log";

const LOGIN_URL = "https://elearning.ut.ac.id/login/index.php";
const DASHBOARD_URL = "https://elearning.ut.ac.id/my/";

export async function login(page: Page, username: string, password: string) {
  logger.info(`Navigating to UT login page`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

  if (page.url().startsWith(DASHBOARD_URL)) {
    logger.ok("Already logged in");
    return { alreadyLoggedIn: true };
  }

  logger.info(`Filling credentials for ${username}`);
  await page.fill("#username", username);
  await page.fill("#password", password);

  logger.info("Submitting login form");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click("#loginbtn"),
  ]);

  const loginError = await page.locator("#loginerrormessage").first().textContent().catch(() => null);
  if (loginError) {
    logger.err(`Login failed: ${loginError.trim()}`);
    throw new Error(`Login failed: ${loginError.trim()}`);
  }

  if (!page.url().includes("elearning.ut.ac.id")) {
    logger.err(`Unexpected redirect: ${page.url()}`);
    throw new Error(`Unexpected redirect after login: ${page.url()}`);
  }

  logger.ok(`Logged in as ${username}`);
  return { alreadyLoggedIn: false };
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  logger.info("Checking login status");
  await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded" });
  const ok = !page.url().includes("/login/");
  logger.info(ok ? "Session active" : "Not logged in");
  return ok;
}
