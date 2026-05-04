import { db } from "@/lib/firebase-admin";
import type { Discussion, Post } from "@/types";
import { Timestamp } from "firebase-admin/firestore";

function col(credentialId: string, courseId: string) {
  return db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .doc(courseId)
    .collection("discussions");
}

function postsCol(credentialId: string, courseId: string, discussionId: string) {
  return col(credentialId, courseId).doc(discussionId).collection("posts");
}

function toDiscussion(id: string, data: FirebaseFirestore.DocumentData): Discussion {
  return {
    id,
    title: data.title,
    url: data.url,
    startedBy: data.startedBy,
    lastPostBy: data.lastPostBy,
    lastPostDate: data.lastPostDate,
    repliesCount: data.repliesCount,
    iReplied: data.iReplied ?? false,
    collectedAt: (data.collectedAt as Timestamp).toDate().toISOString(),
  };
}

function toPost(id: string, data: FirebaseFirestore.DocumentData): Post {
  return {
    postId: id,
    subject: data.subject,
    author: data.author,
    authorUrl: data.authorUrl,
    datetimeIso: data.datetimeIso,
    contentHtml: data.contentHtml,
    parentPostId: data.parentPostId,
    isMyPost: data.isMyPost,
    depth: data.depth,
    rating: data.rating ?? null,
    ratingCount: data.ratingCount ?? null,
    iRepliedToThis: data.iRepliedToThis ?? false,
  };
}

// ── Discussions ──────────────────────────────────────────────────────────────

export async function listDiscussions(
  credentialId: string,
  courseId: string,
): Promise<Discussion[]> {
  const snap = await col(credentialId, courseId).orderBy("collectedAt", "desc").get();
  return snap.docs.map((d) => toDiscussion(d.id, d.data()));
}

export async function getDiscussion(
  credentialId: string,
  courseId: string,
  discussionId: string,
): Promise<Discussion | null> {
  const doc = await col(credentialId, courseId).doc(discussionId).get();
  if (!doc.exists) return null;
  return toDiscussion(doc.id, doc.data()!);
}

type SaveDiscussionInput = Omit<Discussion, "collectedAt">;

export async function saveDiscussion(
  credentialId: string,
  courseId: string,
  d: SaveDiscussionInput,
): Promise<{ saved: boolean; unchanged: boolean }> {
  const ref = col(credentialId, courseId).doc(d.id);
  const existing = await ref.get();

  if (existing.exists) {
    const prev = existing.data()!;
    const prevDateValid = typeof prev.lastPostDate === "string" && prev.lastPostDate.length > 0;
    if (prevDateValid && prev.lastPostBy === d.lastPostBy && prev.lastPostDate === d.lastPostDate) {
      return { saved: false, unchanged: true };
    }
  }

  await ref.set({
    title: d.title,
    url: d.url,
    startedBy: d.startedBy,
    lastPostBy: d.lastPostBy,
    lastPostDate: d.lastPostDate,
    repliesCount: d.repliesCount,
    iReplied: d.iReplied,
    collectedAt: Timestamp.now(),
  });

  return { saved: true, unchanged: false };
}

export async function updateDiscussionReplied(
  credentialId: string,
  courseId: string,
  discussionId: string,
  iReplied: boolean,
): Promise<void> {
  await col(credentialId, courseId).doc(discussionId).update({ iReplied });
}

// ── Posts ────────────────────────────────────────────────────────────────────

export async function savePosts(
  credentialId: string,
  courseId: string,
  discussionId: string,
  posts: Post[],
): Promise<void> {
  const pCol = postsCol(credentialId, courseId, discussionId);
  const batch = db().batch();
  for (const p of posts) {
    batch.set(pCol.doc(p.postId), {
      subject: p.subject,
      author: p.author,
      authorUrl: p.authorUrl,
      datetimeIso: p.datetimeIso,
      contentHtml: p.contentHtml,
      parentPostId: p.parentPostId ?? null,
      isMyPost: p.isMyPost,
      depth: p.depth,
      rating: p.rating ?? null,
      ratingCount: p.ratingCount ?? null,
      iRepliedToThis: p.iRepliedToThis ?? false,
      savedAt: Timestamp.now(),
    });
  }
  await batch.commit();
}

export async function listPosts(
  credentialId: string,
  courseId: string,
  discussionId: string,
): Promise<Post[]> {
  const snap = await postsCol(credentialId, courseId, discussionId).get();
  return snap.docs.map((d) => toPost(d.id, d.data()));
}

// ── Needs Reply ──────────────────────────────────────────────────────────────

export type NeedsReplyGroup = {
  courseId: string;
  courseName: string;
  discussion: Discussion;
  posts: Post[];
};

/**
 * Fetch all discussions where iReplied=false across all courses for a credential.
 * Returns grouped by course, sorted by lastPostDate desc.
 */
export async function listNeedsReply(credentialId: string): Promise<NeedsReplyGroup[]> {
  // Get all courses
  const coursesSnap = await db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .get();

  const groups: NeedsReplyGroup[] = [];

  await Promise.all(
    coursesSnap.docs.map(async (courseDoc) => {
      const courseName = courseDoc.data().name ?? courseDoc.id;

      const discSnap = await col(credentialId, courseDoc.id)
        .where("iReplied", "==", false)
        .orderBy("lastPostDate", "desc")
        .get();

      await Promise.all(
        discSnap.docs.map(async (discDoc) => {
          const discussion = toDiscussion(discDoc.id, discDoc.data());
          const postsSnap = await postsCol(credentialId, courseDoc.id, discDoc.id).get();
          const posts = postsSnap.docs.map((p) => toPost(p.id, p.data()));
          groups.push({ courseId: courseDoc.id, courseName, discussion, posts });
        }),
      );
    }),
  );

  // Sort by lastPostDate desc across courses
  groups.sort((a, b) =>
    (b.discussion.lastPostDate ?? "").localeCompare(a.discussion.lastPostDate ?? ""),
  );

  return groups;
}

export async function countNeedsReply(credentialId: string): Promise<number> {
  const coursesSnap = await db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .get();

  const counts = await Promise.all(
    coursesSnap.docs.map(async (courseDoc) => {
      const snap = await col(credentialId, courseDoc.id)
        .where("iReplied", "==", false)
        .count()
        .get();
      return snap.data().count;
    }),
  );

  return counts.reduce((a, b) => a + b, 0);
}
