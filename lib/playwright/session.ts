import { chromium, Browser, BrowserContext, Page } from "playwright";
import { saveContext } from "./browser";
import { login, isLoggedIn, SessionExpiredError } from "./ut-login";
import { getCredentialWithSecret } from "@/lib/credentials";
import { logger } from "@/lib/activity-log";

type Session = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

const sessions = new Map<string, Session>();

// Per-credential "have we logged in to UT this process?" flag. Lets scraping
// skip the dashboard round-trip once a login is confirmed. Cleared whenever the
// browser session is relaunched or closed, so a stale flag can never cause us
// to skip a needed re-login.
const loggedIn = new Map<string, boolean>();

export function markLoggedIn(credentialId: string): void {
  loggedIn.set(credentialId, true);
}

export function isMarkedLoggedIn(credentialId: string): boolean {
  return loggedIn.get(credentialId) === true;
}

async function isAlive(s: Session): Promise<boolean> {
  try {
    await s.page.evaluate(() => true);
    return true;
  } catch {
    return false;
  }
}

export async function getSession(credentialId: string): Promise<Session> {
  const existing = sessions.get(credentialId);
  if (existing && (await isAlive(existing))) {
    logger.info(`Reusing browser session [${credentialId.slice(0, 6)}]`);
    return existing;
  }

  if (existing) {
    logger.warn(`Dead session for [${credentialId.slice(0, 6)}] — relaunching`);
    sessions.delete(credentialId);
    loggedIn.delete(credentialId);
    try { await existing.browser.close(); } catch { /* ignore */ }
  }

  const headed = process.env.PLAYWRIGHT_HEADED !== "0";
  logger.info(`Launching ${headed ? "headed" : "headless"} browser`);
  const browser = await chromium.launch({ headless: !headed });

  const { newContext } = await import("./browser");
  const context = await newContext(browser, credentialId);
  const page = await context.newPage();

  logger.ok("Browser ready");
  const session: Session = { browser, context, page };
  sessions.set(credentialId, session);
  return session;
}

export async function saveSession(credentialId: string): Promise<void> {
  const s = sessions.get(credentialId);
  if (!s) return;
  await saveContext(s.context, credentialId);
  logger.info("Session cookies saved");
}

/**
 * Return a session that is logged in to UT, logging in first when needed.
 *
 * Fast path: if we've already confirmed login this process (flag set), the
 * existing page is returned with no network round-trip. Otherwise we check the
 * dashboard and, if not authenticated, log in with the stored credentials,
 * persist cookies, and set the flag.
 *
 * The caller MUST already hold the per-credential lock — this drives the shared
 * page, so concurrent callers would otherwise trample each other.
 */
export async function ensureLoggedIn(credentialId: string): Promise<Session> {
  const session = await getSession(credentialId);
  if (loggedIn.get(credentialId)) return session;

  if (await isLoggedIn(session.page)) {
    logger.info("Existing UT session still valid");
  } else {
    const cred = await getCredentialWithSecret(credentialId);
    if (!cred) throw new Error("Credential not found — cannot log in to UT");
    logger.info("No active UT session — logging in first");
    await login(session.page, cred.username, cred.password);
    await saveSession(credentialId);
  }
  loggedIn.set(credentialId, true);
  return session;
}

/**
 * Force a fresh UT login on the existing browser session.
 *
 * `ensureLoggedIn` trusts its per-process flag and never re-checks, so a long
 * crawl can outlive UT's server-side session and start silently reading login
 * pages. Scrapers that detect that bounce call this to recover.
 *
 * The caller MUST already hold the per-credential lock.
 */
export async function reauthenticate(credentialId: string) {
  loggedIn.delete(credentialId);
  return ensureLoggedIn(credentialId);
}

/**
 * Run a UT action on the logged-in page. If it fails with SessionExpiredError
 * (UT logged us out, e.g. during a long batch delay), log in again and retry
 * once. Actions must only throw SessionExpiredError before submitting anything,
 * so the retry can't double-post.
 *
 * The caller MUST already hold the per-credential lock.
 */
export async function withRelogin<T>(
  credentialId: string,
  action: (page: Page) => Promise<T>,
): Promise<T> {
  const session = await ensureLoggedIn(credentialId);
  try {
    return await action(session.page);
  } catch (err) {
    if (!(err instanceof SessionExpiredError)) throw err;
    logger.warn("UT session expired — logging in again");
    const fresh = await reauthenticate(credentialId);
    return action(fresh.page);
  }
}

export async function closeSession(credentialId: string): Promise<void> {
  const s = sessions.get(credentialId);
  if (!s) return;
  sessions.delete(credentialId);
  loggedIn.delete(credentialId);
  try { await s.browser.close(); } catch { /* ignore */ }
  logger.info(`Browser closed [${credentialId.slice(0, 6)}]`);
}
