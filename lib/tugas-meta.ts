import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import type { PedomanItem } from "@/types";

export type { TugasMeta } from "@/types";

function docRef(credentialId: string, courseId: string, assignId: string) {
  return db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .doc(courseId)
    .collection("tugas")
    .doc(assignId);
}

function parsePedomanItems(data: FirebaseFirestore.DocumentData): PedomanItem[] {
  // New format: pedomanItems array
  if (Array.isArray(data.pedomanItems)) {
    return data.pedomanItems.filter(
      (item: unknown): item is PedomanItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PedomanItem).criteria === "string" &&
        typeof (item as PedomanItem).maxScore === "number",
    );
  }
  // Legacy: pedomanScore was a free-text string — migrate to single item
  if (typeof data.pedomanScore === "string" && data.pedomanScore.trim()) {
    return [{ criteria: data.pedomanScore, maxScore: 100 }];
  }
  return [];
}

export async function getTugasMeta(
  credentialId: string,
  courseId: string,
  assignId: string,
): Promise<import("@/types").TugasMeta> {
  const doc = await docRef(credentialId, courseId, assignId).get();
  if (!doc.exists) return { description: "", pedomanItems: [], updatedAt: null };
  const data = doc.data()!;
  return {
    description: data.description ?? "",
    pedomanItems: parsePedomanItems(data),
    updatedAt: (data.metaUpdatedAt as Timestamp)?.toDate().toISOString() ?? null,
  };
}

export async function saveTugasMeta(
  credentialId: string,
  courseId: string,
  assignId: string,
  meta: { description: string; pedomanItems: PedomanItem[] },
): Promise<void> {
  await docRef(credentialId, courseId, assignId).set(
    {
      description: meta.description,
      pedomanItems: meta.pedomanItems,
      metaUpdatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}
