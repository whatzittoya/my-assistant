import { chromium, Browser, BrowserContext } from "playwright";
import path from "node:path";
import fs from "node:fs";

const SESSIONS_DIR = path.join(process.cwd(), ".playwright-sessions");

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function storageStatePath(credentialId: string) {
  ensureDir();
  return path.join(SESSIONS_DIR, `${credentialId}.json`);
}

export async function launch(): Promise<Browser> {
  const headed = process.env.PLAYWRIGHT_HEADED !== "0";
  return chromium.launch({ headless: !headed });
}

export async function newContext(
  browser: Browser,
  credentialId: string,
): Promise<BrowserContext> {
  const file = storageStatePath(credentialId);
  const hasState = fs.existsSync(file);
  return browser.newContext(hasState ? { storageState: file } : {});
}

export async function saveContext(
  context: BrowserContext,
  credentialId: string,
): Promise<void> {
  await context.storageState({ path: storageStatePath(credentialId) });
}
