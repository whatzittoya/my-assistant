import { db } from "@/lib/firebase-admin";
import type { Discussion, Post, PedomanItem, DiskusiMeta } from "@/types";
import { Timestamp } from "firebase-admin/firestore";

// Path: credentials/{id}/courses/{courseId}/diskusi/{forumId}/discussions/{discId}

function discCol(credentialId: string, courseId: string, forumId: string) {
  return db()
    .collection("credentials")
    .doc(credentialId)
    .collection("courses")
    .doc(courseId)
    .collection("diskusi")
    .doc(forumId)
    .collection("discussions");
}

function postsCol(credentialId: string, courseId: string, forumId: string, discId: string) {
  return discCol(credentialId, courseId, forumId).doc(discId).collection("posts");
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

export async function listSessionDiscussions(
  credentialId: string,
  courseId: string,
  forumId: string,
): Promise<Discussion[]> {
  const snap = await discCol(credentialId, courseId, forumId)
    .orderBy("collectedAt", "desc")
    .get();
  return snap.docs.map((d) => toDiscussion(d.id, d.data()));
}

export async function getSessionDiscussion(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
): Promise<Discussion | null> {
  const doc = await discCol(credentialId, courseId, forumId).doc(discId).get();
  if (!doc.exists) return null;
  return toDiscussion(doc.id, doc.data()!);
}

type SaveDiscussionInput = Omit<Discussion, "collectedAt">;

export async function saveSessionDiscussion(
  credentialId: string,
  courseId: string,
  forumId: string,
  d: SaveDiscussionInput,
): Promise<{ saved: boolean; unchanged: boolean }> {
  const ref = discCol(credentialId, courseId, forumId).doc(d.id);
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

export async function updateSessionDiscussionReplied(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
  iReplied: boolean,
): Promise<void> {
  await discCol(credentialId, courseId, forumId).doc(discId).update({ iReplied });
}

export async function saveSessionPosts(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
  posts: Post[],
): Promise<void> {
  const pCol = postsCol(credentialId, courseId, forumId, discId);
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

export async function listSessionPosts(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
): Promise<Post[]> {
  const snap = await postsCol(credentialId, courseId, forumId, discId).get();
  return snap.docs.map((d) => toPost(d.id, d.data()));
}

// ── Diskusi meta (question + pedoman penilaian) ───────────────────────────────

function genMetaId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function parsePedomanItems(data: FirebaseFirestore.DocumentData): PedomanItem[] {
  if (Array.isArray(data.pedomanItems)) {
    return (data.pedomanItems as unknown[])
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .filter((item) => typeof item.criteria === "string" && typeof item.maxScore === "number")
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : genMetaId(),
        criteria: item.criteria as string,
        maxScore: item.maxScore as number,
      }));
  }
  return [];
}

// Dedicated meta doc: credentials/{id}/courses/{cid}/diskusi/{fid}/discussions/{did}/meta/data
// Separate from the scraped discussion doc to avoid merge conflicts.
function metaRef(credentialId: string, courseId: string, forumId: string, discId: string) {
  return discCol(credentialId, courseId, forumId)
    .doc(discId)
    .collection("meta")
    .doc("data");
}

export async function getDiskusiMeta(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
): Promise<DiskusiMeta> {
  const doc = await metaRef(credentialId, courseId, forumId, discId).get();
  if (!doc.exists) return { question: "", pedomanItems: [], updatedAt: null };
  const data = doc.data()!;
  return {
    question: data.question ?? "",
    pedomanItems: parsePedomanItems(data),
    updatedAt: (data.metaUpdatedAt as Timestamp)?.toDate().toISOString() ?? null,
  };
}

export async function saveDiskusiMeta(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
  meta: { question: string; pedomanItems: PedomanItem[] },
): Promise<void> {
  await metaRef(credentialId, courseId, forumId, discId).set({
    question: meta.question,
    pedomanItems: meta.pedomanItems,
    metaUpdatedAt: Timestamp.now(),
  });
}

export async function deleteSessionDiscussion(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
): Promise<void> {
  const discRef = discCol(credentialId, courseId, forumId).doc(discId);
  const postsSnap = await discRef.collection("posts").get();
  const batch = db().batch();
  for (const doc of postsSnap.docs) batch.delete(doc.ref);
  batch.delete(discRef);
  await batch.commit();
}
