import type { Post } from "@/types";

/**
 * Per-discussion reply status, computed from stored posts.
 *
 * Mirrors the thread page's logic (diskusi-actions `isReplied`): a non-tutor
 * post counts as "replied" only if it has a child post authored by me AND
 * wasn't manually flagged "not replied" by the lecturer. Children by other
 * students (e.g. an answer mis-posted under someone else's post) don't count.
 */
export function diskusiReplyStatus(
  posts: Post[],
  manualUnreplied: Iterable<string> = [],
): { totalStudents: number; unrepliedStudents: number } {
  const overrides = new Set(manualUnreplied);

  const repliedByMe = new Set<string>();
  for (const p of posts) {
    if (p.parentPostId && p.isMyPost) repliedByMe.add(p.parentPostId);
  }

  const students = posts.filter((p) => !p.isMyPost);
  let unreplied = 0;
  for (const s of students) {
    const replied = !overrides.has(s.postId) && repliedByMe.has(s.postId);
    if (!replied) unreplied++;
  }

  return { totalStudents: students.length, unrepliedStudents: unreplied };
}
