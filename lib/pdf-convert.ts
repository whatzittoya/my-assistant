import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { logger } from "@/lib/activity-log";

export const OFFICE_EXTS = new Set([".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"]);

export function findLibreOffice(): string {
  const candidates = [
    "soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/soffice",
    "/usr/local/bin/soffice",
  ];
  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" --version`, { stdio: "pipe", timeout: 5000 });
      return cmd;
    } catch { /* try next */ }
  }
  throw new Error(
    "LibreOffice not found. Install it (https://www.libreoffice.org) to convert Office files to PDF.",
  );
}

/**
 * Converts an Office file to PDF using LibreOffice.
 * Output is saved alongside the original file (same dir, .pdf extension).
 * Returns the path to the generated PDF.
 */
export function convertToPdf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return filePath;
  if (!OFFICE_EXTS.has(ext)) throw new Error(`Unsupported extension for PDF conversion: ${ext}`);

  const soffice = findLibreOffice();
  const outDir = path.dirname(filePath);
  const baseName = path.basename(filePath, ext);
  const pdfPath = path.join(outDir, `${baseName}.pdf`);

  logger.info(`Converting ${path.basename(filePath)} → PDF`);
  execSync(`"${soffice}" --headless --convert-to pdf --outdir "${outDir}" "${filePath}"`, {
    timeout: 60_000,
    stdio: "pipe",
  });

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`LibreOffice produced no output at ${pdfPath}`);
  }
  logger.ok(`Converted → ${path.basename(pdfPath)}`);
  return pdfPath;
}
