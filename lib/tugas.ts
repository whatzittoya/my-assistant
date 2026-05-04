import { db } from "@/lib/firebase-admin";
import type { TugasSubmission, TugasFile } from "@/types";
import { Timestamp } from "firebase-admin/firestore";

function subCol(credentialId: string, courseId: string, assignId: string) {
  return db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .doc(courseId)
    .collection("tugas")
    .doc(assignId)
    .collection("submissions");
}

function toFile(data: FirebaseFirestore.DocumentData): TugasFile {
  return {
    filename: data.filename,
    url: data.url,
    submittedAt: data.submittedAt ?? "",
    localPath: data.localPath ?? null,
  };
}

function toSubmission(id: string, data: FirebaseFirestore.DocumentData): TugasSubmission {
  return {
    userId: id,
    name: data.name,
    email: data.email,
    status: data.status,
    grade: data.grade ?? null,
    lastModifiedSubmission: data.lastModifiedSubmission ?? "",
    lastModifiedGrade: data.lastModifiedGrade ?? null,
    feedbackComment: data.feedbackComment ?? "",
    finalGrade: data.finalGrade ?? null,
    files: (data.files ?? []).map(toFile),
    collectedAt: (data.collectedAt as Timestamp).toDate().toISOString(),
  };
}

export async function listTugasSubmissions(
  credentialId: string,
  courseId: string,
  assignId: string,
): Promise<TugasSubmission[]> {
  const snap = await subCol(credentialId, courseId, assignId)
    .orderBy("name", "asc")
    .get();
  return snap.docs.map((d) => toSubmission(d.id, d.data()));
}

export async function deleteTugasSubmissions(
  credentialId: string,
  courseId: string,
  assignId: string,
): Promise<number> {
  const snap = await subCol(credentialId, courseId, assignId).get();
  const batch = db().batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return snap.size;
}

export async function saveTugasSubmissions(
  credentialId: string,
  courseId: string,
  assignId: string,
  submissions: Omit<TugasSubmission, "collectedAt">[],
): Promise<void> {
  const col = subCol(credentialId, courseId, assignId);
  const batch = db().batch();
  for (const s of submissions) {
    batch.set(col.doc(s.userId), {
      name: s.name,
      email: s.email,
      status: s.status,
      grade: s.grade ?? null,
      lastModifiedSubmission: s.lastModifiedSubmission,
      lastModifiedGrade: s.lastModifiedGrade ?? null,
      feedbackComment: s.feedbackComment,
      finalGrade: s.finalGrade ?? null,
      files: s.files.map((f) => ({
        filename: f.filename,
        url: f.url,
        submittedAt: f.submittedAt,
        localPath: f.localPath ?? null,
      })),
      collectedAt: Timestamp.now(),
    });
  }
  await batch.commit();
}
