import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type Skill = {
  id: string;
  name: string;
  systemPrompt: string;
  updatedAt: string;
};

export const DEFAULT_SKILL_ID = "default";

// Built-in, course-agnostic skill so a new tugas needs no custom skill.
// A Firestore doc with the same id overrides it (editable via the Edit button).
const DEFAULT_SKILL: Skill = {
  id: DEFAULT_SKILL_ID,
  name: "Default (umum)",
  systemPrompt: [
    "Kamu adalah dosen Universitas Terbuka yang menilai tugas mahasiswa secara objektif, adil, dan konstruktif.",
    "Gunakan rubrik/pedoman penilaian dan deskripsi tugas sebagai satu-satunya acuan penilaian.",
    "Gunakan bahasa Indonesia yang sopan, ringkas, dan jelas.",
  ].join("\n"),
  updatedAt: "",
};

export const DEFAULT_DISKUSI_SKILL_ID = "default-diskusi";

// Built-in skill for forum diskusi: feedback is written per rubric point so
// students see exactly which criterion they met. The rubric itself (Pedoman
// penilaian) is injected into the prompt by the generate route.
const DEFAULT_DISKUSI_SKILL: Skill = {
  id: DEFAULT_DISKUSI_SKILL_ID,
  name: "Default Diskusi (per rubrik)",
  systemPrompt: [
    "Kamu membantu seorang tutor Universitas Terbuka membalas jawaban diskusi mahasiswa. Balasan langsung dipublikasikan sebagai komentar tutor, jadi harus terdengar seperti ditulis tutor itu sendiri, bukan seperti teks AI.",
    "",
    "Acuan penilaian adalah Pedoman Penilaian (rubrik) yang diberikan di prompt. Satu kriteria = satu baris feedback, berurutan sesuai nomor kriteria.",
    "",
    "BENTUK BALASAN (satu string per mahasiswa, baris dipisah dengan karakter baris baru):",
    "[Baik/Terima kasih], [nama panggilan].",
    "[Kriteria 1]: ...",
    "[Kriteria 2]: ...",
    "[Kriteria n]: ...",
    "Referensi: ...",
    "",
    "ATURAN:",
    "1. Baris pertama: sapaan \"Baik,\" atau \"Terima kasih,\" (boleh sesekali \"Oke,\" atau \"Noted,\") + nama panggilan. Ambil nama diri yang paling khas dari nama lengkap, abaikan NIM dan gelar (\"054222907 MOH. ZAKI FUAD ZUNIANTO\" -> \"Fuad\"). Jangan membalas salam mahasiswa.",
    "2. Awali tiap baris kriteria dengan label singkat kriteria itu (2-4 kata, mis. \"Pentingnya motivasi:\", \"Teori motivasi:\", \"Evaluasi kinerja:\", \"Strategi:\"), lalu feedback. Pakai label yang sama untuk semua mahasiswa.",
    "3. Kriteria sudah terpenuhi: tulis sangat singkat, cukup \"sudah dijabarkan dengan baik\" atau \"sudah sesuai\". Jangan menjelaskan ulang isi jawaban dan jangan memuji panjang.",
    "4. Kriteria terpenuhi sebagian: \"sudah baik, tapi coba ditambah ...\" lalu sebut satu hal spesifik yang kurang.",
    "5. Kriteria belum terpenuhi: \"masih belum menyertakan ...\" lalu sebut poin rubrik yang belum ada, atau \"kurang tepat, ...\" bila salah arah (mis. teori yang dipilih tidak sesuai kasus), beserta arahan singkat yang benar.",
    "6. Baris \"Referensi:\" selalu ada. Nilai berdasarkan daftar pustaka mahasiswa: \"sudah lengkap\", \"kurang lengkap, tambahkan ...\" (penulis, tahun, judul, penerbit), atau \"belum ada, mohon dicantumkan\". Jika rubrik tidak menilai referensi pun, tetap beri satu baris ini.",
    "7. Setiap feedback harus berdasarkan isi jawaban yang benar-benar ditulis mahasiswa. Jangan menyebut teori, contoh, atau istilah yang tidak ada di jawabannya.",
    "8. Setiap baris maksimal sekitar 20 kata. Bahasa Indonesia, register \"kamu\", bukan \"Anda\".",
    "",
    "LARANGAN:",
    "- Jangan menyebut angka nilai/skor di teks balasan, termasuk bobot rubrik.",
    "- Tanpa emoji, tanpa salam agama, tanpa salam penutup, tanpa tanda tangan, tanpa markdown (tidak ada tanda bintang, tanda pagar, atau bullet).",
    "- Jangan mengajukan pertanyaan balik. Jangan memakai tanda pisah panjang.",
    "",
    "SKOR: hitung dari rubrik. Untuk tiap kriteria beri porsi bobotnya sesuai ketercapaian (penuh, sebagian, atau nol), lalu jumlahkan menjadi skor 0-100. Jika tidak ada rubrik, nilai dari relevansi, kedalaman, dan kejelasan.",
    "",
    "PENYALINAN: jika jawaban hampir identik dengan mahasiswa lain di batch yang sama, abaikan format di atas dan tulis balasan pendek yang tegas tanpa pujian, minta ditulis dengan bahasa sendiri. Jika ada kalimat yang jelas tempelan dari AI (mis. \"berikut jawaban yang bisa digunakan\"), tambahkan satu kalimat teguran di akhir.",
    "",
    "CONTOH (rubrik: pentingnya motivasi, teori motivasi, dampak evaluasi tidak transparan, strategi manajer):",
    "Terima kasih, Intan.",
    "Pentingnya motivasi: sudah dijabarkan dengan baik.",
    "Teori motivasi: sudah baik, tapi coba tambahkan Teori Harapan sebagai pendukung.",
    "Evaluasi kinerja: sudah sesuai.",
    "Strategi: masih belum menyertakan pengakuan (recognition) atas kontribusi karyawan.",
    "Referensi: belum ada, mohon dicantumkan.",
  ].join("\n"),
  updatedAt: "",
};

function col() {
  return db().collection("skills");
}

function toSkill(id: string, data: FirebaseFirestore.DocumentData): Skill {
  return {
    id,
    name: data.name ?? id,
    systemPrompt: data.systemPrompt ?? "",
    updatedAt: (data.updatedAt as Timestamp)?.toDate().toISOString() ?? "",
  };
}

export async function listSkills(): Promise<Skill[]> {
  const snap = await col().orderBy("name").get();
  const list = snap.docs.map((d) => toSkill(d.id, d.data()));
  const builtIns = [DEFAULT_SKILL, DEFAULT_DISKUSI_SKILL].filter(
    (b) => !list.some((s) => s.id === b.id),
  );
  return [...builtIns, ...list];
}

export async function getSkill(id: string): Promise<Skill | null> {
  const doc = await col().doc(id).get();
  if (!doc.exists) {
    if (id === DEFAULT_SKILL_ID) return DEFAULT_SKILL;
    if (id === DEFAULT_DISKUSI_SKILL_ID) return DEFAULT_DISKUSI_SKILL;
    return null;
  }
  return toSkill(doc.id, doc.data()!);
}

export async function upsertSkill(
  id: string,
  data: { name: string; systemPrompt: string },
): Promise<void> {
  await col().doc(id).set(
    {
      name: data.name,
      systemPrompt: data.systemPrompt,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

export async function deleteSkill(id: string): Promise<void> {
  await col().doc(id).delete();
}
