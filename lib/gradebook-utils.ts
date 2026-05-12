import type { GradebookItem, GradebookSnapshot, GradebookStudent } from "@/types";

export function normalizeGradeValue(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
  return trimmed && trimmed !== "-" ? trimmed : null;
}

export function isMissingGrade(value: string | null | undefined): boolean {
  return normalizeGradeValue(value) === null;
}

export function extractStudentNo(text: string | null | undefined): string | null {
  const match = (text ?? "").match(/\b(\d{8,12})\b/);
  return match?.[1] ?? null;
}

export function studentNoFromEmail(email: string | null | undefined): string | null {
  const match = (email ?? "").match(/^(\d{8,12})@ecampus\.ut\.ac\.id$/i);
  return match?.[1] ?? null;
}

export function normalizeHtmlFeedback(feedback: string | null | undefined): string | null {
  const raw = feedback?.trim();
  if (!raw) return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

export function classifyGradebookItem(name: string, url: string): GradebookItem["kind"] | null {
  const cleanName = name.replace(/\s+/g, " ").trim();
  if (/^Diskusi\s+\d+\s+rating$/i.test(cleanName) && /\/mod\/forum\/view\.php/i.test(url)) {
    return "diskusi";
  }
  if (/^Tugas\s+\d+$/i.test(cleanName) && /\/mod\/assign\/view\.php/i.test(url)) {
    return "tugas";
  }
  return null;
}

export function activityIdFromUrl(kind: GradebookItem["kind"], url: string): string | null {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("id");
    if (!id) return null;
    if (kind === "diskusi" && !parsed.pathname.includes("/mod/forum/view.php")) return null;
    if (kind === "tugas" && !parsed.pathname.includes("/mod/assign/view.php")) return null;
    return id;
  } catch {
    const match = url.match(/[?&]id=(\d+)/);
    return match?.[1] ?? null;
  }
}

export function userIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("id");
  } catch {
    return url.match(/[?&]id=(\d+)/)?.[1] ?? null;
  }
}

export function findGradebookStudent(
  students: GradebookStudent[],
  userId: string | null | undefined,
  studentNo: string | null | undefined,
): GradebookStudent | null {
  if (userId) {
    const byUid = students.find((student) => student.uid === userId);
    if (byUid) return byUid;
  }
  if (studentNo) {
    const byStudentNo = students.find((student) => student.studentNo === studentNo);
    if (byStudentNo) return byStudentNo;
  }
  return null;
}

export function emptyGradebookSnapshot(courseId: string): GradebookSnapshot {
  return {
    courseId,
    sourceUrl: `https://elearning.ut.ac.id/grade/report/grader/index.php?id=${courseId}`,
    items: [],
    students: [],
    collectedAt: new Date(0).toISOString(),
  };
}
