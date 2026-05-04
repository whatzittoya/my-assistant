import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type Skill = {
  id: string;
  name: string;
  systemPrompt: string;
  updatedAt: string;
};

function col() {
  return db().collection("skills");
}

function toSkill(id: string, data: FirebaseFirestore.DocumentData): Skill {
  return {
    id,
    name: data.name ?? id,
    systemPrompt: data.systemPrompt ?? "",
    updatedAt: (data.updatedAt as Timestamp)?.toDate().toISOString() ?? "",
  };
}

export async function listSkills(): Promise<Skill[]> {
  const snap = await col().orderBy("name").get();
  return snap.docs.map((d) => toSkill(d.id, d.data()));
}

export async function getSkill(id: string): Promise<Skill | null> {
  const doc = await col().doc(id).get();
  if (!doc.exists) return null;
  return toSkill(doc.id, doc.data()!);
}

export async function upsertSkill(
  id: string,
  data: { name: string; systemPrompt: string },
): Promise<void> {
  await col().doc(id).set(
    {
      name: data.name,
      systemPrompt: data.systemPrompt,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

export async function deleteSkill(id: string): Promise<void> {
  await col().doc(id).delete();
}
