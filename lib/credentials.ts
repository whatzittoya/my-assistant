import { db } from "@/lib/firebase-admin";
import { encrypt, decrypt } from "@/lib/crypto";
import type { Credential, CredentialWithSecret } from "@/types";
import { Timestamp } from "firebase-admin/firestore";

const COL = "credentials";

type StoredCredential = {
  label: string;
  username: string;
  passwordCt: string;
  passwordIv: string;
  passwordTag: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function toPublic(id: string, d: StoredCredential): Credential {
  return {
    id,
    label: d.label,
    username: d.username,
    createdAt: d.createdAt.toDate().toISOString(),
    updatedAt: d.updatedAt.toDate().toISOString(),
  };
}

export async function listCredentials(): Promise<Credential[]> {
  const snap = await db().collection(COL).orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => toPublic(doc.id, doc.data() as StoredCredential));
}

export async function getCredential(id: string): Promise<Credential | null> {
  const doc = await db().collection(COL).doc(id).get();
  if (!doc.exists) return null;
  return toPublic(doc.id, doc.data() as StoredCredential);
}

export async function getCredentialWithSecret(id: string): Promise<CredentialWithSecret | null> {
  const doc = await db().collection(COL).doc(id).get();
  if (!doc.exists) return null;
  const d = doc.data() as StoredCredential;
  return {
    ...toPublic(doc.id, d),
    password: decrypt(d.passwordCt, d.passwordIv, d.passwordTag),
  };
}

export async function createCredential(input: {
  label: string;
  username: string;
  password: string;
}): Promise<Credential> {
  const enc = encrypt(input.password);
  const now = Timestamp.now();
  const ref = await db().collection(COL).add({
    label: input.label,
    username: input.username,
    passwordCt: enc.ct,
    passwordIv: enc.iv,
    passwordTag: enc.tag,
    createdAt: now,
    updatedAt: now,
  } satisfies StoredCredential);
  const doc = await ref.get();
  return toPublic(doc.id, doc.data() as StoredCredential);
}

export async function updateCredential(
  id: string,
  input: { label?: string; username?: string; password?: string },
): Promise<Credential | null> {
  const ref = db().collection(COL).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const patch: Partial<StoredCredential> = { updatedAt: Timestamp.now() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.username !== undefined) patch.username = input.username;
  if (input.password !== undefined) {
    const enc = encrypt(input.password);
    patch.passwordCt = enc.ct;
    patch.passwordIv = enc.iv;
    patch.passwordTag = enc.tag;
  }
  await ref.update(patch);
  const updated = await ref.get();
  return toPublic(updated.id, updated.data() as StoredCredential);
}

export async function deleteCredential(id: string): Promise<boolean> {
  const ref = db().collection(COL).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}
