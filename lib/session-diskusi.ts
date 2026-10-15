import { db } from "@/lib/firebase-admin";
import type { Discussion, DiscussionWithStatus, Post, PedomanItem, DiskusiMeta, DiskusiDraft } from "@/types";
import { diskusiReplyStatus } from "@/lib/diskusi-reply-status";
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

// Discussions augmented with per-thread reply status, computed from each
// thread's stored posts + manual override. Reveals threads that are only
// partially replied (a binary iReplied flag would hide these).
export async function listSessionDiscussionsWithStatus(
  credentialId: string,
  courseId: string,
  forumId: string,
): Promise<DiscussionWithStatus[]> {
  const discussions = await listSessionDiscussions(credentialId, courseId, forumId);
  return Promise.all(
    discussions.map(async (d) => {
      const [posts, meta] = await Promise.all([
        listSessionPosts(credentialId, courseId, forumId, d.id),
        getDiskusiMeta(credentialId, courseId, forumId, d.id),
      ]);
      const { totalStudents, unrepliedStudents } = diskusiReplyStatus(posts, meta.manualUnreplied);
      return { ...d, totalStudents, unrepliedStudents };
    }),
  );
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

function parseManualUnreplied(data: FirebaseFirestore.DocumentData): string[] {
  if (!Array.isArray(data.manualUnreplied)) return [];
  return (data.manualUnreplied as unknown[]).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

function parseDrafts(data: FirebaseFirestore.DocumentData): DiskusiDraft[] {
  if (!Array.isArray(data.drafts)) return [];
  return (data.drafts as unknown[])
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => ({
      postId: String(d.postId ?? ""),
      reply: typeof d.reply === "string" ? d.reply : "",
      score: typeof d.score === "number" ? d.score : null,
    }))
    .filter((d) => d.postId);
}

export async function getDiskusiMeta(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
): Promise<DiskusiMeta> {
  const doc = await metaRef(credentialId, courseId, forumId, discId).get();
  if (!doc.exists)
    return {
      question: "",
      pedomanItems: [],
      drafts: [],
      draftsUpdatedAt: null,
      manualUnreplied: [],
      updatedAt: null,
    };
  const data = doc.data()!;
  return {
    question: data.question ?? "",
    pedomanItems: parsePedomanItems(data),
    drafts: parseDrafts(data),
    draftsUpdatedAt: (data.draftsUpdatedAt as Timestamp)?.toDate().toISOString() ?? null,
    manualUnreplied: parseManualUnreplied(data),
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
  // merge so the reply-status override (manualUnreplied) is never clobbered.
  await metaRef(credentialId, courseId, forumId, discId).set(
    {
      question: meta.question,
      pedomanItems: meta.pedomanItems,
      metaUpdatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

/** Persist hand-edited drafts, leaving question/pedoman/manualUnreplied intact. */
export async function saveDiskusiDrafts(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
  drafts: DiskusiDraft[],
): Promise<void> {
  await metaRef(credentialId, courseId, forumId, discId).set(
    {
      drafts,
      draftsUpdatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

// Persist only the manual reply-status override, leaving question/pedoman intact.
export async function saveDiskusiManualUnreplied(
  credentialId: string,
  courseId: string,
  forumId: string,
  discId: string,
  postIds: string[],
): Promise<void> {
  await metaRef(credentialId, courseId, forumId, discId).set(
    {
      manualUnreplied: postIds,
      metaUpdatedAt: Timestamp.now(),
    },
    { merge: true },
  );
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
