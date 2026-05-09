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

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function parsePedomanItems(data: FirebaseFirestore.DocumentData): PedomanItem[] {
  if (Array.isArray(data.pedomanItems)) {
    return data.pedomanItems
      .filter(
        (item: unknown): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
      .filter((item) => typeof item.criteria === "string" && typeof item.maxScore === "number")
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : genId(),
        criteria: item.criteria as string,
        maxScore: item.maxScore as number,
      }));
  }
  // Legacy: pedomanScore free-text → single item
  if (typeof data.pedomanScore === "string" && data.pedomanScore.trim()) {
    return [{ id: genId(), criteria: data.pedomanScore, maxScore: 100 }];
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
