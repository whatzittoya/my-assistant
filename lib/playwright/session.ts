import { chromium, Browser, BrowserContext, Page } from "playwright";
import { saveContext } from "./browser";
import { logger } from "@/lib/activity-log";

type Session = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

const sessions = new Map<string, Session>();

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

export async function closeSession(credentialId: string): Promise<void> {
  const s = sessions.get(credentialId);
  if (!s) return;
  sessions.delete(credentialId);
  try { await s.browser.close(); } catch { /* ignore */ }
  logger.info(`Browser closed [${credentialId.slice(0, 6)}]`);
}
