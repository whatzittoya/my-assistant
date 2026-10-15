import type { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/lib/activity-log";
import { OFFICE_EXTS, convertToPdf } from "@/lib/pdf-convert";

export function sanitizeFilename(s: string): string {
  return s
    .replace(/[\/\\:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function filenameFromResponse(url: string, contentDisposition?: string): string {
  const star = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return sanitizeFilename(decodeURIComponent(star[1]));
  const plain = contentDisposition?.match(/filename="?([^";]+)"?/i);
  if (plain) return sanitizeFilename(plain[1]);
  const last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  return sanitizeFilename(last || "file");
}

/** Big PDFs/PPTs off UT's CDN routinely need more than the 30s default. */
const DOWNLOAD_TIMEOUT_MS = 120_000;

export type DownloadOptions = {
  /** Convert Office files to PDF and drop the original (for inline rendering). */
  convertOffice?: boolean;
  /** Base dir the returned localPath is relative to. Defaults to `dir`. */
  relativeTo?: string;
};

/**
 * Downloads one file activity. `mod/resource/view.php?id=…` either streams the
 * file directly (force-download resources) or renders an HTML page that
 * embeds/links the real pluginfile.php URL — handle both.
 *
 * Never throws: returns null so a broken file doesn't abort the whole scrape.
 */
export async function downloadResource(
  page: Page,
  resourceUrl: string,
  dir: string,
  activityName: string,
  opts: DownloadOptions = {},
): Promise<{ filename: string; localPath: string } | null> {
  const request = page.context().request;
  const base = opts.relativeTo ?? dir;

  let res;
  let body: Buffer;
  try {
    res = await request.get(resourceUrl, { timeout: DOWNLOAD_TIMEOUT_MS });
    if (!res.ok()) {
      logger.warn(`Download failed (${res.status()}): ${activityName}`);
      return null;
    }

    if ((res.headers()["content-type"] ?? "").includes("text/html")) {
      const html = await res.text();
      const m = html.match(/https?:\/\/[^"'\s]*?pluginfile\.php\/[^"'\s\\]+/);
      if (!m) {
        logger.warn(`No file link found on resource page: ${activityName}`);
        return null;
      }
      const fileUrl = m[0].replace(/&amp;/g, "&");
      res = await request.get(fileUrl, { timeout: DOWNLOAD_TIMEOUT_MS });
      if (!res.ok()) {
        logger.warn(`File fetch failed (${res.status()}): ${activityName}`);
        return null;
      }
    }

    body = await res.body();
  } catch (e) {
    // A slow or dropped download must never abort the caller's loop.
    logger.warn(`Download error on "${activityName}": ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    return null;
  }

  const filename = filenameFromResponse(res.url(), res.headers()["content-disposition"]);
  fs.mkdirSync(dir, { recursive: true });
  const rawPath = path.join(dir, filename);
  fs.writeFileSync(rawPath, body);
  logger.ok(`Downloaded: ${filename}`);

  if (opts.convertOffice) {
    const ext = path.extname(filename).toLowerCase();
    if (OFFICE_EXTS.has(ext)) {
      try {
        const pdfPath = convertToPdf(rawPath);
        fs.unlinkSync(rawPath);
        return {
          filename: path.basename(pdfPath),
          localPath: path.relative(base, pdfPath),
        };
      } catch (e) {
        logger.warn(
          `PDF conversion failed, keeping original: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  return { filename, localPath: path.relative(base, rawPath) };
}
