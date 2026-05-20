import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { db } from "@/lib/firebase-admin";
import { listCourses } from "@/lib/courses";
import { listSessions } from "@/lib/sessions";
import { buildAssignFolderName } from "@/lib/playwright/ut-tugas";
import { logger } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILES_BASE = path.join(process.cwd(), ".tugas-files");

type Renamed = {
  credentialId: string;
  oldName: string;
  newName: string;
  courseId: string;
  updatedDocs: number;
};

export async function POST() {
  if (!fs.existsSync(FILES_BASE)) {
    return NextResponse.json({ ok: true, renamed: [], note: "No .tugas-files directory" });
  }

  const renamed: Renamed[] = [];
  const skipped: { credentialId: string; name: string; reason: string }[] = [];

  const credDirs = fs
    .readdirSync(FILES_BASE, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const credDir of credDirs) {
    const credentialId = credDir.name;
    const credPath = path.join(FILES_BASE, credentialId);

    // Build assignId -> { courseId, courseName, tugasName }
    const courses = await listCourses(credentialId).catch(() => []);
    const map = new Map<string, { courseId: string; courseName: string; tugasName: string }>();
    for (const course of courses) {
      const sessions = await listSessions(credentialId, course.courseId).catch(() => []);
      for (const sess of sessions) {
        for (const t of sess.tugas) {
          const m = t.url.match(/[?&]id=(\d+)/);
          if (m) {
            map.set(m[1], {
              courseId: course.courseId,
              courseName: course.name,
              tugasName: t.name,
            });
          }
        }
      }
    }

    const assignDirs = fs
      .readdirSync(credPath, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const ad of assignDirs) {
      // Skip already-renamed (contain " - ")
      if (ad.name.includes(" - ")) {
        skipped.push({ credentialId, name: ad.name, reason: "already renamed" });
        continue;
      }
      const assignId = ad.name;
      const info = map.get(assignId);
      if (!info) {
        skipped.push({ credentialId, name: ad.name, reason: "no course/session match in Firestore" });
        continue;
      }

      const newName = buildAssignFolderName(assignId, info.courseName, info.tugasName);
      if (newName === assignId) {
        skipped.push({ credentialId, name: ad.name, reason: "computed name unchanged" });
        continue;
      }

      const oldPath = path.join(credPath, assignId);
      const newPath = path.join(credPath, newName);
      if (fs.existsSync(newPath)) {
        skipped.push({ credentialId, name: ad.name, reason: `target exists: ${newName}` });
        continue;
      }

      fs.renameSync(oldPath, newPath);
      logger.ok(`Renamed: ${oldPath} -> ${newPath}`);

      // Update Firestore localPaths for this assignment
      const subCol = db()
        .collection("credentials")
        .doc(credentialId)
        .collection("courses")
        .doc(info.courseId)
        .collection("tugas")
        .doc(assignId)
        .collection("submissions");

      const snap = await subCol.get();
      const batch = db().batch();
      const oldPrefix = `${assignId}/`;
      const newPrefix = `${newName}/`;
      let docCount = 0;
      for (const doc of snap.docs) {
        const data = doc.data();
        const files = (data.files ?? []) as { localPath: string | null }[];
        let changed = false;
        const updated = files.map((f) => {
          if (f.localPath && f.localPath.startsWith(oldPrefix)) {
            changed = true;
            return { ...f, localPath: newPrefix + f.localPath.slice(oldPrefix.length) };
          }
          return f;
        });
        if (changed) {
          batch.update(doc.ref, { files: updated });
          docCount++;
        }
      }
      if (docCount > 0) await batch.commit();

      renamed.push({
        credentialId,
        oldName: assignId,
        newName,
        courseId: info.courseId,
        updatedDocs: docCount,
      });
    }
  }

  return NextResponse.json({ ok: true, renamed, skipped });
}
