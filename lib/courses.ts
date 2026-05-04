import { db } from "@/lib/firebase-admin";
import type { Course } from "@/types";
import { Timestamp } from "firebase-admin/firestore";

function col(credentialId: string) {
  return db().collection("credentials").doc(credentialId).collection("courses");
}

export async function listCourses(credentialId: string): Promise<Course[]> {
  const snap = await col(credentialId).orderBy("name").get();
  return snap.docs.map((d) => {
    const data = d.data() as { name: string; url: string; forumPerkenalan?: string; collectedAt: Timestamp };
    return {
      courseId: d.id,
      name: data.name,
      url: data.url,
      forumPerkenalan: data.forumPerkenalan,
      collectedAt: data.collectedAt.toDate().toISOString(),
    };
  });
}

export async function getCourse(credentialId: string, courseId: string): Promise<Course | null> {
  const doc = await col(credentialId).doc(courseId).get();
  if (!doc.exists) return null;
  const data = doc.data() as { name: string; url: string; forumPerkenalan?: string; collectedAt: Timestamp };
  return {
    courseId: doc.id,
    name: data.name,
    url: data.url,
    forumPerkenalan: data.forumPerkenalan,
    collectedAt: data.collectedAt.toDate().toISOString(),
  };
}

export async function saveCourses(credentialId: string, courses: Course[]): Promise<void> {
  const batch = db().batch();
  const now = Timestamp.now();
  for (const c of courses) {
    const ref = col(credentialId).doc(c.courseId);
    batch.set(ref, { name: c.name, url: c.url, collectedAt: now });
  }
  await batch.commit();
}

export async function updateCourseForumUrl(
  credentialId: string,
  courseId: string,
  forumUrl: string,
): Promise<void> {
  await col(credentialId).doc(courseId).update({ forumPerkenalan: forumUrl });
}
