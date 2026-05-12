import { db } from "@/lib/firebase-admin";
import {
  emptyGradebookSnapshot,
  extractStudentNo,
  findGradebookStudent,
  isMissingGrade,
  studentNoFromEmail,
  userIdFromUrl,
} from "@/lib/gradebook-utils";
import { listTugasSubmissions } from "@/lib/tugas";
import type {
  GradebookSnapshot,
  GradebookStudent,
  ScoreMonitorEvidence,
  ScoreMonitorRow,
  ScoreMonitorSummary,
} from "@/types";
import { Timestamp } from "firebase-admin/firestore";

function gradebookRef(credentialId: string, courseId: string) {
  return db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .doc(courseId)
    .collection("gradebook")
    .doc("snapshot");
}

function courseRef(credentialId: string, courseId: string) {
  return db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .doc(courseId);
}

function toSnapshot(id: string, data: FirebaseFirestore.DocumentData): GradebookSnapshot {
  return {
    courseId: data.courseId ?? id,
    sourceUrl: data.sourceUrl ?? `https://elearning.ut.ac.id/grade/report/grader/index.php?id=${id}`,
    items: data.items ?? [],
    students: data.students ?? [],
    collectedAt:
      data.collectedAt instanceof Timestamp
        ? data.collectedAt.toDate().toISOString()
        : data.collectedAt ?? new Date(0).toISOString(),
  };
}

export async function getGradebookSnapshot(
  credentialId: string,
  courseId: string,
): Promise<GradebookSnapshot | null> {
  const doc = await gradebookRef(credentialId, courseId).get();
  if (!doc.exists) return null;
  return toSnapshot(courseId, doc.data()!);
}

export async function saveGradebookSnapshot(
  credentialId: string,
  courseId: string,
  snapshot: GradebookSnapshot,
): Promise<void> {
  await gradebookRef(credentialId, courseId).set({
    courseId,
    sourceUrl: snapshot.sourceUrl,
    items: snapshot.items,
    students: snapshot.students,
    collectedAt: Timestamp.now(),
  });
}

type EvidenceIndex = {
  byUserId: Map<string, ScoreMonitorEvidence>;
  byStudentNo: Map<string, ScoreMonitorEvidence>;
};

type StoredDiskusiPost = {
  postId: string;
  author?: string;
  authorUrl?: string;
  parentPostId?: string | null;
  isMyPost?: boolean;
  depth?: number;
};

function putEvidence(index: EvidenceIndex, evidence: ScoreMonitorEvidence) {
  if (evidence.userId && !index.byUserId.has(evidence.userId)) {
    index.byUserId.set(evidence.userId, evidence);
  }
  if (evidence.studentNo && !index.byStudentNo.has(evidence.studentNo)) {
    index.byStudentNo.set(evidence.studentNo, evidence);
  }
}

function evidenceForStudent(index: EvidenceIndex, student: GradebookStudent): ScoreMonitorEvidence | null {
  return (
    (student.uid ? index.byUserId.get(student.uid) : undefined) ??
    (student.studentNo ? index.byStudentNo.get(student.studentNo) : undefined) ??
    null
  );
}

async function buildDiskusiEvidence(
  credentialId: string,
  courseId: string,
  forumId: string,
  students: GradebookStudent[],
): Promise<EvidenceIndex> {
  const index: EvidenceIndex = { byUserId: new Map(), byStudentNo: new Map() };
  const discussionsSnap = await courseRef(credentialId, courseId)
    .collection("diskusi")
    .doc(forumId)
    .collection("discussions")
    .get();

  for (const discussionDoc of discussionsSnap.docs) {
    const discussion = discussionDoc.data();
    const postsSnap = await discussionDoc.ref.collection("posts").get();
    const posts = postsSnap.docs.map((doc) => ({ postId: doc.id, ...doc.data() }) as StoredDiskusiPost);
    const tutorReplyParents = new Set(
      posts
        .filter((post) => post.isMyPost && typeof post.parentPostId === "string")
        .map((post) => post.parentPostId as string),
    );

    for (const post of posts) {
      if (post.isMyPost || post.depth !== 1) continue;
      const userId = userIdFromUrl(post.authorUrl);
      const studentNo = extractStudentNo(post.author);
      if (!findGradebookStudent(students, userId, studentNo)) continue;

      putEvidence(index, {
        exists: true,
        source: "diskusi",
        userId,
        studentNo,
        title: post.author ?? "Student post",
        url: `${discussion.url ?? ""}#p${post.postId}`,
        detail: discussion.title ?? `Diskusi ${forumId}`,
        hasTutorReply: tutorReplyParents.has(post.postId),
      });
    }
  }

  return index;
}

function hasTugasSubmissionEvidence(submission: {
  status: string;
  files: unknown[];
  lastModifiedSubmission: string;
}): boolean {
  const status = submission.status.toLowerCase();
  if (status.includes("submitted")) return true;
  if (submission.files.length > 0) return true;
  const modified = submission.lastModifiedSubmission.trim();
  return modified !== "" && modified !== "-";
}

async function buildTugasEvidence(
  credentialId: string,
  courseId: string,
  assignId: string,
): Promise<EvidenceIndex> {
  const index: EvidenceIndex = { byUserId: new Map(), byStudentNo: new Map() };
  const submissions = await listTugasSubmissions(credentialId, courseId, assignId);

  for (const submission of submissions) {
    if (!hasTugasSubmissionEvidence(submission)) continue;
    const studentNo = studentNoFromEmail(submission.email) ?? extractStudentNo(submission.name);
    putEvidence(index, {
      exists: true,
      source: "tugas",
      userId: submission.userId,
      studentNo,
      title: submission.name,
      url: `/credentials/${credentialId}/courses/${courseId}/tugas/${assignId}/submissions/${submission.userId}`,
      detail: submission.status || "Submitted",
    });
  }

  return index;
}

export async function buildScoreMonitor(
  credentialId: string,
  courseId: string,
): Promise<{
  snapshot: GradebookSnapshot;
  rows: ScoreMonitorRow[];
  summary: ScoreMonitorSummary;
}> {
  const snapshot = (await getGradebookSnapshot(credentialId, courseId)) ?? emptyGradebookSnapshot(courseId);
  const evidenceByItem = new Map<string, EvidenceIndex>();

  await Promise.all(
    snapshot.items.map(async (item) => {
      const evidence =
        item.kind === "diskusi"
          ? await buildDiskusiEvidence(credentialId, courseId, item.activityId, snapshot.students)
          : await buildTugasEvidence(credentialId, courseId, item.activityId);
      evidenceByItem.set(item.itemId, evidence);
    }),
  );

  const rows: ScoreMonitorRow[] = [];
  for (const item of snapshot.items) {
    const evidenceIndex = evidenceByItem.get(item.itemId);
    for (const student of snapshot.students) {
      const grade = student.grades.find((g) => g.itemId === item.itemId);
      const evidence = evidenceIndex ? evidenceForStudent(evidenceIndex, student) : null;
      const missingScore = !!evidence && isMissingGrade(grade?.value);
      rows.push({
        item,
        student,
        lmsGrade: grade?.value ?? null,
        feedback: grade?.feedback ?? null,
        evidence,
        missingScore,
      });
    }
  }

  const summary: ScoreMonitorSummary = {
    totalRows: rows.length,
    missingScores: rows.filter((row) => row.missingScore).length,
    missingDiskusi: rows.filter((row) => row.missingScore && row.item.kind === "diskusi").length,
    missingTugas: rows.filter((row) => row.missingScore && row.item.kind === "tugas").length,
  };

  return { snapshot, rows, summary };
}
