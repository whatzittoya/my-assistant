import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import type { RubrikFile } from "@/types";

// Dedicated meta doc: credentials/{id}/courses/{cid}/diskusi/{fid}/meta/rubrik
// Separate from the scraped discussion docs to avoid merge conflicts.
function rubrikRef(credentialId: string, courseId: string, forumId: string) {
  return db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .doc(courseId)
    .collection("diskusi")
    .doc(forumId)
    .collection("meta")
    .doc("rubrik");
}

function toRubrikFile(item: Record<string, unknown>): RubrikFile | null {
  if (typeof item.localPath !== "string" || typeof item.filename !== "string") return null;
  return {
    name: typeof item.name === "string" ? item.name : item.filename,
    url: typeof item.url === "string" ? item.url : "",
    filename: item.filename,
    localPath: item.localPath,
    collectedAt: typeof item.collectedAt === "string" ? item.collectedAt : "",
  };
}

export async function listRubrikFiles(
  credentialId: string,
  courseId: string,
  forumId: string,
): Promise<RubrikFile[]> {
  const doc = await rubrikRef(credentialId, courseId, forumId).get();
  if (!doc.exists) return [];
  const files = doc.data()!.files;
  if (!Array.isArray(files)) return [];
  return (files as unknown[])
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map(toRubrikFile)
    .filter((f): f is RubrikFile => f !== null);
}

export async function saveRubrikFiles(
  credentialId: string,
  courseId: string,
  forumId: string,
  files: RubrikFile[],
): Promise<void> {
  await rubrikRef(credentialId, courseId, forumId).set({
    files,
    updatedAt: Timestamp.now(),
  });
}
