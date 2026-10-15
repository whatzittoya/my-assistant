import { RUBRIK_FILES_BASE } from "@/lib/playwright/ut-rubrik";
import { serveLocalFile } from "@/lib/file-serve";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return serveLocalFile(RUBRIK_FILES_BASE, searchParams.get("path"));
}
