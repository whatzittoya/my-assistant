import { db } from "@/lib/firebase-admin";
import type { Semester } from "@/types";
import { Timestamp } from "firebase-admin/firestore";

function col(credentialId: string) {
  return db().collection("credentials").doc(credentialId).collection("semesters");
}

function toSemester(id: string, data: FirebaseFirestore.DocumentData): Semester {
  return {
    id,
    name: data.name,
    courseIds: data.courseIds ?? [],
    createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
    updatedAt: (data.updatedAt as Timestamp).toDate().toISOString(),
  };
}

export async function listSemesters(credentialId: string): Promise<Semester[]> {
  const snap = await col(credentialId).orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => toSemester(doc.id, doc.data()));
}

export async function saveSemesterSnapshot(
  credentialId: string,
  id: string,
  name: string,
  courseIds: string[],
): Promise<void> {
  const ref = col(credentialId).doc(id);
  const existing = await ref.get();
  const now = Timestamp.now();
  await ref.set({
    name,
    courseIds,
    createdAt: existing.exists ? existing.data()!.createdAt : now,
    updatedAt: now,
  });
}

export async function updateSemesterCourses(
  credentialId: string,
  id: string,
  courseIds: string[],
): Promise<void> {
  await col(credentialId).doc(id).update({ courseIds, updatedAt: Timestamp.now() });
}

export function currentSemester(): { id: string; name: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")!.value;
  const year = parts.find((part) => part.type === "year")!.value;
  return {
    id: `${year}-${month.toLowerCase()}`,
    name: `Semester ${month} ${year}`,
  };
}
