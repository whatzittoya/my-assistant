import { db } from "@/lib/firebase-admin";
import type { Session } from "@/types";
import { Timestamp } from "firebase-admin/firestore";

function col(credentialId: string, courseId: string) {
  return db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .doc(courseId)
    .collection("sessions");
}

function toSession(id: string, data: FirebaseFirestore.DocumentData): Session {
  return {
    id,
    name: data.name,
    url: data.url,
    diskusi: data.diskusi ?? [],
    tugas: data.tugas ?? [],
    collectedAt: (data.collectedAt as Timestamp).toDate().toISOString(),
  };
}

export async function listSessions(credentialId: string, courseId: string): Promise<Session[]> {
  const snap = await col(credentialId, courseId).orderBy("name").get();
  return snap.docs.map((d) => toSession(d.id, d.data()));
}

export async function saveSessions(
  credentialId: string,
  courseId: string,
  sessions: Session[],
): Promise<void> {
  const batch = db().batch();
  const now = Timestamp.now();
  for (const s of sessions) {
    const ref = col(credentialId, courseId).doc(s.id);
    batch.set(ref, {
      name: s.name,
      url: s.url,
      diskusi: s.diskusi,
      tugas: s.tugas,
      collectedAt: now,
    });
  }
  await batch.commit();
}
