import { cert, getApps, initializeApp, ServiceAccount } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

let _db: Firestore | null = null;

export function db(): Firestore {
  if (_db) return _db;

  if (!getApps().length) {
    const keyPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(process.cwd(), "serviceAccountKey.json");

    if (!fs.existsSync(keyPath)) {
      throw new Error(
        `Firebase service account key not found at ${keyPath}. Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in project root.`,
      );
    }

    const svc = JSON.parse(fs.readFileSync(keyPath, "utf8")) as ServiceAccount;
    initializeApp({ credential: cert(svc) });
  }

  _db = getFirestore();
  return _db;
}
