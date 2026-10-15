import * as path from "path";
import { serveLocalFile } from "@/lib/file-serve";

export const dynamic = "force-dynamic";

const FILES_BASE = path.join(process.cwd(), ".tugas-files");

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return serveLocalFile(FILES_BASE, searchParams.get("path"));
}
