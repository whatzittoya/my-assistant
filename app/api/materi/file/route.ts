import { MATERI_BASE } from "@/lib/materi";
import { serveLocalFile } from "@/lib/file-serve";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return serveLocalFile(MATERI_BASE, searchParams.get("path"));
}
