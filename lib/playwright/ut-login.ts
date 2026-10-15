import { Page } from "playwright";
import { logger } from "@/lib/activity-log";

const LOGIN_URL = "https://elearning.ut.ac.id/login/index.php";
const DASHBOARD_URL = "https://elearning.ut.ac.id/my/";

// UT's dashboard is heavy and regularly needs more than Playwright's 30s default,
// especially when a re-login lands in the middle of a long scrape.
const NAV_TIMEOUT_MS = 90_000;

export async function login(page: Page, username: string, password: string) {
  logger.info(`Navigating to UT login page`);
  await page.goto(LOGIN_URL, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });

  if (page.url().startsWith(DASHBOARD_URL)) {
    logger.ok("Already logged in");
    return { alreadyLoggedIn: true };
  }

  logger.info(`Filling credentials for ${username}`);
  const myUtLoginButton = page.locator("#btnLoginMyUT");
  const usesMyUtModal = await myUtLoginButton
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  let submitButton: string;
  if (usesMyUtModal) {
    logger.info("Opening Tutor Eksternal login form");
    await myUtLoginButton.click();
    await page.locator("#btnTutorEksternal").click();
    await page.locator("#username_modal").waitFor({ state: "visible" });
    await page.fill("#username_modal", username);
    await page.fill("#password_modal", password);
    submitButton = "#login-modal button[type='submit']";
  } else {
    await page.fill("#username", username);
    await page.fill("#password", password);
    submitButton = "#loginbtn";
  }

  logger.info("Submitting login form");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
    page.click(submitButton),
  ]);

  const loginError = await page.locator("#loginerrormessage").first().textContent().catch(() => null);
  if (loginError) {
    logger.err(`Login failed: ${loginError.trim()}`);
    throw new Error(`Login failed: ${loginError.trim()}`);
  }

  if (page.url().includes("/login/")) {
    logger.err("Login failed: UT stayed on the login page");
    throw new Error("Login failed: UT stayed on the login page");
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
  await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  const ok = !page.url().includes("/login/");
  logger.info(ok ? "Session active" : "Not logged in");
  return ok;
}

/** Thrown when a UT page bounces to login mid-task (server-side session expired). */
export class SessionExpiredError extends Error {
  constructor(message = "UT session expired") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/**
 * Call when an expected page element is missing. Throws SessionExpiredError if
 * UT logged us out, otherwise throws `fallback` unchanged.
 */
export async function throwIfLoggedOut(page: Page, fallback: Error): Promise<never> {
  if (page.url().includes("/login/") || !(await isLoggedIn(page).catch(() => true))) {
    throw new SessionExpiredError();
  }
  throw fallback;
}
