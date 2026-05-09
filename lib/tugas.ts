import { db } from "@/lib/firebase-admin";
import type { TugasSubmission, TugasFile, SubmissionAiEval, SubmissionFinalEval, CriteriaScore } from "@/types";
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

function subDoc(credentialId: string, courseId: string, assignId: string, userId: string) {
  return subCol(credentialId, courseId, assignId).doc(userId);
}

function toFile(data: FirebaseFirestore.DocumentData): TugasFile {
  return {
    filename: data.filename,
    url: data.url,
    submittedAt: data.submittedAt ?? "",
    localPath: data.localPath ?? null,
  };
}

function parseCriteriaScores(raw: unknown): CriteriaScore[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .filter(
      (item) =>
        typeof item.criteria === "string" &&
        typeof item.score === "number" &&
        typeof item.maxScore === "number",
    )
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : "",
      criteria: item.criteria as string,
      score: item.score as number,
      maxScore: item.maxScore as number,
    }));
}

function parseAiEval(data: FirebaseFirestore.DocumentData): SubmissionAiEval | undefined {
  const raw = data.aiEval;
  if (!raw || typeof raw !== "object") return undefined;
  return {
    criteriaScores: parseCriteriaScores(raw.criteriaScores),
    totalScore: typeof raw.totalScore === "number" ? raw.totalScore : 0,
    reasoning: raw.reasoning ?? "",
    feedback: raw.feedback ?? "",
    generatedAt:
      raw.generatedAt instanceof Timestamp
        ? raw.generatedAt.toDate().toISOString()
        : (raw.generatedAt ?? new Date().toISOString()),
  };
}

function parseFinalEval(data: FirebaseFirestore.DocumentData): SubmissionFinalEval | undefined {
  const raw = data.finalEval;
  if (!raw || typeof raw !== "object") return undefined;
  return {
    criteriaScores: parseCriteriaScores(raw.criteriaScores),
    totalScore: typeof raw.totalScore === "number" ? raw.totalScore : 0,
    feedback: raw.feedback ?? "",
    savedAt:
      raw.savedAt instanceof Timestamp
        ? raw.savedAt.toDate().toISOString()
        : (raw.savedAt ?? new Date().toISOString()),
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
    finalGrade: data.finalGrade != null ? Number(data.finalGrade) || null : null,
    files: (data.files ?? []).map(toFile),
    collectedAt: (data.collectedAt as Timestamp).toDate().toISOString(),
    aiEval: parseAiEval(data),
    finalEval: parseFinalEval(data),
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

export async function getSubmission(
  credentialId: string,
  courseId: string,
  assignId: string,
  userId: string,
): Promise<TugasSubmission | null> {
  const doc = await subDoc(credentialId, courseId, assignId, userId).get();
  if (!doc.exists) return null;
  return toSubmission(doc.id, doc.data()!);
}

export async function saveAiEval(
  credentialId: string,
  courseId: string,
  assignId: string,
  userId: string,
  eval_: Omit<SubmissionAiEval, "generatedAt">,
): Promise<void> {
  await subDoc(credentialId, courseId, assignId, userId).update({
    aiEval: {
      criteriaScores: eval_.criteriaScores,
      totalScore: eval_.totalScore,
      reasoning: eval_.reasoning,
      feedback: eval_.feedback,
      generatedAt: Timestamp.now(),
    },
  });
}

export async function saveFinalEval(
  credentialId: string,
  courseId: string,
  assignId: string,
  userId: string,
  eval_: Omit<SubmissionFinalEval, "savedAt">,
): Promise<void> {
  await subDoc(credentialId, courseId, assignId, userId).update({
    finalEval: {
      criteriaScores: eval_.criteriaScores,
      totalScore: eval_.totalScore,
      feedback: eval_.feedback,
      savedAt: Timestamp.now(),
    },
  });
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
  submissions: Omit<TugasSubmission, "collectedAt" | "aiEval" | "finalEval">[],
): Promise<void> {
  const col = subCol(credentialId, courseId, assignId);
  const batch = db().batch();
  for (const s of submissions) {
    batch.set(
      col.doc(s.userId),
      {
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
      },
      { merge: true },
    );
  }
  await batch.commit();
}
