"use client";

import { useEffect, useState } from "react";
import { cleanPostHtml } from "@/lib/post-html";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PostThread, CollapsibleContent } from "@/components/post-thread";
import { SkillManager } from "@/components/skill-manager";
import type { Post, DiskusiMeta, PedomanItem } from "@/types";
import type { Skill } from "@/lib/skills";

// ── Types ─────────────────────────────────────────────────────────────────────

type GenerateResult = {
  postId: string;
  author: string;
  score: number;
  draft: string;
  replies: string[];
  aiScore?: number;            // AI-detected writing quality score
  duplicateConfidence?: number; // 0-100, how likely copy-paste
  duplicateOf?: string | null;  // postId of the likely source
};

type PostStatus = "idle" | "posting" | "done" | "error";

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

function hasEmDash(text: string): boolean {
  // Plain string search \u2014 a module-level /g regex with .test() carries
  // lastIndex between calls, which made this return different results on
  // server vs client and broke hydration.
  return text.includes("\u2014");
}

function sanitizeDraft(text: string): string {
  return text.replace(/\s*\u2014\s*/g, ", ");
}

const RUBRIK_INSTRUCTION = `Kamu membantu seorang tutor Universitas Terbuka mengubah file PDF rubrik diskusi menjadi JSON pedoman penilaian.

Input: file PDF rubrik diskusi (terlampir). Biasanya berisi daftar nomor soal, tiap soal punya "Jawaban Ideal" dan "Bobot".

Tugas:
1. Baca seluruh PDF, jangan ada nomor soal yang terlewat.
2. Untuk setiap nomor soal, buat satu kriteria:
   - criteria: ringkasan jawaban ideal dalam Bahasa Indonesia, diawali topik soalnya, lalu poin-poin yang harus muncul dalam jawaban mahasiswa. Pertahankan istilah, nama teori, dan daftar (a, b, c, ...) persis seperti di PDF. Jangan menambah poin yang tidak ada di PDF.
   - maxScore: bobot soal itu sebagai angka bulat, sesuai PDF.
3. Jika PDF memuat teks soal atau kasus, isi "question" dengan teksnya. Jika tidak ada, isi "question" dengan string kosong "".
4. Jumlah semua maxScore harus sama dengan total bobot di PDF (biasanya 100). Jika tidak sama, jangan diubah diam-diam. Tulis selisihnya di "warnings".
5. Jangan mengarang bobot. Kalau bobot suatu soal tidak terbaca jelas, isi maxScore dengan null dan jelaskan di "warnings".

Aturan format criteria:
- Satu string per kriteria, satu baris, tanpa markdown dan tanpa baris baru.
- Gunakan " | " untuk memisahkan poin yang harus ada.
- Panjang maksimal sekitar 80 kata per kriteria.

Contoh bentuk criteria:
"Pentingnya motivasi kerja | dorongan internal dan eksternal yang memengaruhi perilaku untuk mencapai tujuan | karyawan termotivasi menunjukkan semangat, komitmen, inisiatif, kinerja | motivasi rendah menurunkan produktivitas, kepuasan, komitmen sehingga tujuan organisasi sulit tercapai"

Kembalikan HANYA JSON valid, tanpa markdown dan tanpa teks lain:
{
  "question": "<teks soal/kasus atau string kosong>",
  "pedomanItems": [
    { "id": "1", "criteria": "<kriteria soal 1>", "maxScore": <integer> }
  ],
  "totalMaxScore": <integer jumlah semua maxScore>,
  "warnings": []
}`;

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

function scoreColor(score: number) {
  if (score >= 80) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 60) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// Lightweight collapsible group: a heading with a chevron and no heavy box, so
// inner cards stay clean. Used for the status-grouped sections.
function Group({
  title,
  defaultOpen = true,
  tone = "muted",
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  tone?: "muted" | "amber";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneClass = tone === "amber" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${toneClass} hover:opacity-80`}
      >
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        {title}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

// Sticky status bar: a one-glance summary of what's left, with a segmented
// progress bar (green done · amber awaiting score · red needs reply).
function StatusBar({
  needsReply,
  awaitingScore,
  done,
  total,
  children,
}: {
  needsReply: number;
  awaitingScore: number;
  done: number;
  total: number;
  children?: React.ReactNode;
}) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="sticky top-0 z-10 space-y-2 rounded-lg border bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {needsReply > 0 ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {needsReply} needs reply
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-semibold text-green-600 dark:text-green-400">
            ✓ All replied
          </span>
        )}
        {awaitingScore > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {awaitingScore} to score
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {done} done
        </span>
        <span className="text-xs text-muted-foreground">· {total} student{total !== 1 ? "s" : ""}</span>
        {children && <div className="ml-auto">{children}</div>}
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-green-500 transition-all" style={{ width: `${pct(done)}%` }} />
        <div className="bg-amber-500 transition-all" style={{ width: `${pct(awaitingScore)}%` }} />
        <div className="bg-red-500 transition-all" style={{ width: `${pct(needsReply)}%` }} />
      </div>
    </div>
  );
}

// ── Inline draft card (shown below each unreplied student post) ───────────────

function InlineDraftCard({
  result,
  post,
  posts,
  status,
  regenerating,
  credentialId,
  courseId,
  forumId,
  discId,
  discussionUrl,
  delayMin,
  delayMax,
  skillId,
  onDraftChange,
  onScoreChange,
  onDone,
  onRegenerate,
}: {
  result: GenerateResult;
  post: Post | undefined;
  posts: Post[];
  status: PostStatus;
  regenerating: boolean;
  credentialId: string;
  courseId: string;
  forumId: string;
  discId: string;
  discussionUrl: string;
  delayMin: number;
  delayMax: number;
  skillId: string;
  onDraftChange: (draft: string) => void;
  onScoreChange: (score: number) => void;
  onDone: () => void;
  onRegenerate: () => void;
}) {
  async function postReply() {
    try {
      const res = await fetch("/api/actions/post-diskusi-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId, courseId, forumId, discId, discussionUrl,
          items: [{ postId: result.postId, reply: sanitizeDraft(result.draft), score: result.score }],
          delayMin, delayMax,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      if (json.results?.[0]?.status === "error") throw new Error(json.results[0].error ?? "Failed");
      onDone();
      toast.success(`Replied to ${result.author}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className={`mt-3 rounded-lg border bg-muted/20 p-3 space-y-2 ${status === "done" ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Draft reply for {result.author}</span>
        {result.aiScore !== undefined && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            result.aiScore >= 70
              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
              : "bg-muted text-muted-foreground"
          }`}>
            AI {result.aiScore}%
          </span>
        )}
        {result.duplicateConfidence !== undefined && result.duplicateConfidence > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            result.duplicateConfidence >= 70
              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
          }`}>
            Copy {result.duplicateConfidence}%
            {result.duplicateOf ? ` of ${posts.find((x) => x.postId === result.duplicateOf)?.author ?? result.duplicateOf.slice(-6)}` : ""}
          </span>
        )}
        <div className="flex items-center gap-1">
          <Input
            type="number" min={0} max={100}
            value={result.score}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onScoreChange(Number(e.target.value))}
            className={`w-16 h-6 text-center text-xs font-semibold rounded-full border-0 ${scoreColor(result.score)}`}
            disabled={status === "done"}
          />
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
        {status === "posting" && <Badge variant="secondary" className="text-xs">Posting...</Badge>}
        {status === "done" && <Badge variant="default" className="text-xs">Posted</Badge>}
        {status === "error" && <Badge variant="destructive" className="text-xs">Failed</Badge>}
      </div>
      {hasEmDash(result.draft) && (
        <p className="text-xs text-orange-600 dark:text-orange-400">
          Em dash found and will be replaced with - on post.
        </p>
      )}
      <Textarea
        value={result.draft}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onDraftChange(e.target.value)}
        rows={3}
        className="text-sm"
        disabled={status === "done"}
      />
      {status !== "done" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={postReply} disabled={status === "posting" || !result.draft.trim()}>
            {status === "posting" ? "Posting..." : "Post"}
          </Button>
          <Button size="sm" variant="outline" onClick={onRegenerate} disabled={regenerating || status === "posting"}>
            {regenerating ? "..." : "Regenerate"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Replied student card (read-only, collapsed) ───────────────────────────────

function RepliedStudentCard({ post, myReply, noScore, onMarkUnreplied }: { post: Post; myReply: Post; noScore?: boolean; onMarkUnreplied: () => void }) {
  const [open, setOpen] = useState(false);
  const date = post.datetimeIso
    ? new Date(post.datetimeIso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "";
  return (
    <div className={`rounded-lg border p-3 text-sm ${noScore ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20" : "bg-muted/30 opacity-70"}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{post.author}</span>
        <Badge variant="default" className="text-xs">Replied</Badge>
        {noScore ? (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            No score
          </span>
        ) : post.rating !== null && (
          <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${scoreColor(post.rating!)}`}>
            {post.rating}{post.ratingCount ? ` (${post.ratingCount})` : ""}
          </span>
        )}
        {date && <span className="text-xs text-muted-foreground">{date}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onMarkUnreplied}
            className="text-xs text-muted-foreground hover:text-destructive"
            title="Move this student back into the reply workflow"
          >
            Mark not replied
          </button>
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
            {open ? "Hide" : "Show reply"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="prose prose-sm dark:prose-invert max-w-none border-l-2 pl-3 text-muted-foreground" dangerouslySetInnerHTML={{ __html: cleanPostHtml(post.contentHtml) }} />
          <div className="rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">My reply:</p>
            <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: cleanPostHtml(myReply.contentHtml) }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export / Upload dialog ────────────────────────────────────────────────────

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildInstruction(
  promptPost: Post | undefined,
  discussionTitle: string,
  question: string,
  pedomanItems: PedomanItem[],
) {
  const activePedoman = pedomanItems.filter((p) => p.criteria.trim());
  const totalMax = activePedoman.reduce((s, p) => s + p.maxScore, 0) || 100;

  const pedomanBlock =
    activePedoman.length > 0
      ? [
          `\nPedoman Penilaian (Total Maks. ${totalMax} poin):`,
          ...activePedoman.map((p, i) => `${i + 1}. ${p.criteria} — maks. ${p.maxScore} poin`),
        ].join("\n")
      : "";

  const questionLine = question.trim()
    ? `- Pertanyaan diskusi: "${question.trim()}"`
    : promptPost
      ? `- Pertanyaan diskusi (dari kiriman awal tutor): "${stripHtml(promptPost.contentHtml)}"`
      : "";

  return `Kamu membantu seorang tutor Universitas Terbuka menilai dan membalas jawaban diskusi mahasiswa. Balasan harus terdengar seperti ditulis tutor itu sendiri, bukan seperti teks AI.

Konteks:
- Judul diskusi: "${discussionTitle}"
${questionLine}${pedomanBlock}

GAYA BALASAN TUTOR (wajib diikuti)

Bentuk baku, 2-3 kalimat, 15-45 kata, Bahasa Indonesia:
[Sapaan + nama panggilan]. [Apa yang sudah baik, sebut isi spesifik jawabannya]. [Satu hal yang perlu ditambah atau diperbaiki].

1. Sapaan. Pilih salah satu secara bergantian dan wajar: "Terima kasih,", "Baik,", "Oke,", "Noted,", sesekali "Sudah dibaca," atau "Poin yang menarik,". Jangan memakai sapaan yang sama untuk semua mahasiswa, tetapi jangan pula memutarnya secara kaku berurutan.
2. Nama panggilan. Ambil nama diri yang paling khas dari nama lengkap mahasiswa, abaikan NIM. Contoh: "054222907 MOH. ZAKI FUAD ZUNIANTO" -> "Fuad"; "AHMAD ANDIKA RESTU WARDANA" -> "Andika". Jika ada dua mahasiswa dengan nama depan sama dalam batch ini, pakai nama kedua agar tidak tertukar.
3. Kalimat pujian HARUS menyebut isi nyata jawaban mahasiswa: nama brand, perusahaan, konsep, atau istilah yang benar-benar dia tulis. JANGAN PERNAH menyebut contoh yang tidak ada di jawabannya. Kalau dia menulis Infarm, jangan menulis Erigo. Ini aturan paling penting.
4. Kalimat saran. Paling sering: minta satu contoh perusahaan/kasus nyata ("tambahkan satu contoh perusahaan nyata supaya tidak hanya normatif"). Alternatif lain sesuai kekurangan yang benar-benar terlihat: rujukan/daftar pustaka belum ada atau perlu dirapikan, penulisan kurang rapi, ada poin rubrik yang belum dibahas, ada bagian yang tidak nyambung dengan soal dan sebaiknya dihapus.
5. Kata penghubung ke saran: "Namun,", "Akan lebih baik jika", "Agar lebih kuat,", "Yang kurang cuma", "tinggal", "Coba". Jika jawaban memang sudah bagus, boleh ditutup dengan "sudah oke".
6. Nada mengikuti mutu jawaban: skor tinggi (>=88) lebih apresiatif dan boleh 3 kalimat; skor menengah cukup 2 kalimat dan langsung ke kekurangannya; skor rendah lebih ringkas dan tegas.
7. Jika terindikasi menyalin jawaban peserta lain (duplicate_confidence > 50): balasan jadi lebih pendek dan dingin, tanpa pujian, minta ditulis dengan bahasa sendiri. Contoh nada: "Sepertinya kamu copy jawaban teman diatas, kedepannya jangan diulangi lagi." atau "Isi dan susunan jawaban ini sama persis dengan punya peserta lain, pastikan ditulis sendiri."

Larangan keras:
- JANGAN menyebut angka nilai/skor di dalam teks balasan.
- Tanpa emoji, tanpa salam pembuka agama, tanpa salam penutup, tanpa tanda tangan.
- Jangan membalas salam mahasiswa dan jangan mengajukan pertanyaan balik.
- Jangan memakai "Anda" atau "Saudara"; kalau perlu menyapa langsung gunakan "kamu".
- Jangan melebihi 3 kalimat.

Contoh balasan yang benar:
- "Terima kasih, Zaki. Jawaban sudah menangkap peran utama media sosial dan memberi contoh yang relevan. Ke depan, contoh bisnisnya perlu dijelaskan sedikit, misalnya strategi konten atau dampaknya terhadap penjualan."
- "Baik, Salsabila. Yang kurang cuma contoh perusahaan nyata, kelima manfaatnya masih berhenti di teori, tambahkan satu kasus konkret."
- "Noted, Adenin. Pembahasan tiap fase dan ekonomi sirkularnya lengkap, contoh Sasa dan Patagonia juga menarik."
- "Oke, Dian. Coba tambahkan satu contoh penerapan."

Untuk setiap jawaban mahasiswa, hasilkan:
1. score (0-100): nilai berdasarkan relevansi, kedalaman, dan kejelasan${activePedoman.length > 0 ? ", mengikuti pedoman penilaian di atas" : ""}.
2. reply: balasan tutor sesuai gaya di atas.
3. ai_score (0-100): kemungkinan teks ditulis AI (100 = hampir pasti AI).
4. duplicate_confidence (0-100): kemungkinan disalin dari peserta lain dalam batch ini.
5. duplicate_of: postId sumber yang paling mungkin jika duplicate_confidence > 50, selain itu null.

Kembalikan HANYA JSON yang valid - tanpa markdown, tanpa teks lain:
{
  "results": [
    {
      "postId": "<postId sama seperti input>",
      "name": "<nama mahasiswa>",
      "score": <integer 0-100>,
      "reply": "<balasan tutor dalam Bahasa Indonesia>",
      "ai_score": <integer 0-100>,
      "duplicate_confidence": <integer 0-100>,
      "duplicate_of": "<postId atau null>"
    }
  ]
}`;
}

function buildDiscussionJson(selectedPosts: Post[]) {
  return JSON.stringify(
    {
      students: selectedPosts.map((p) => ({
        postId: p.postId,
        author: p.author,
        datetime: p.datetimeIso,
        content: stripHtml(p.contentHtml),
      })),
    },
    null,
    2,
  );
}

/**
 * The entire thread as it appears on UT — every post, nested by parentPostId,
 * with the lecturer's own replies inline and marked `isMe`. Use when you want
 * the conversation for context rather than a grading batch.
 */
const STUDENT_WORD_CAP = 200;

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")} … [dipotong, ${words.length} kata]`;
}

type ThreadJsonOptions = {
  /** Only the lecturer's own replies, each with the post it answers. */
  myRepliesOnly: boolean;
  /** Cap student post text at this many words (0 = no cap). */
  maxStudentWords: number;
};

function buildFullThreadJson(
  posts: Post[],
  discussionTitle: string,
  question: string,
  opts: ThreadJsonOptions,
) {
  const byParent = new Map<string | null, Post[]>();
  const ids = new Set(posts.map((p) => p.postId));
  for (const p of posts) {
    // Treat a post whose parent isn't in this thread as a root.
    const key = p.parentPostId && ids.has(p.parentPostId) ? p.parentPostId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(p);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => (a.datetimeIso ?? "").localeCompare(b.datetimeIso ?? ""));
  }

  // The cap is for reading other people's walls of text — never our own replies.
  const textOf = (p: Post) => {
    const raw = stripHtml(p.contentHtml);
    return !p.isMyPost && opts.maxStudentWords > 0
      ? truncateWords(raw, opts.maxStudentWords)
      : raw;
  };

  const node = (p: Post): Record<string, unknown> => {
    const children = (byParent.get(p.postId) ?? []).map(node);
    return {
      postId: p.postId,
      author: p.author,
      isMe: p.isMyPost,
      datetime: p.datetimeIso,
      subject: p.subject,
      content: textOf(p),
      ...(p.rating !== null && p.rating !== undefined ? { score: p.rating } : {}),
      ...(children.length > 0 ? { replies: children } : {}),
    };
  };

  const header = {
    title: discussionTitle,
    question: question.trim() || undefined,
    totalPosts: posts.length,
    myPosts: posts.filter((p) => p.isMyPost).length,
    exportedAt: new Date().toISOString(),
  };

  if (opts.myRepliesOnly) {
    const byId = new Map(posts.map((p) => [p.postId, p]));
    const myReplies = posts
      .filter((p) => p.isMyPost)
      .sort((a, b) => (a.datetimeIso ?? "").localeCompare(b.datetimeIso ?? ""))
      .map((p) => {
        const parent = p.parentPostId ? byId.get(p.parentPostId) : undefined;
        return {
          postId: p.postId,
          datetime: p.datetimeIso,
          reply: stripHtml(p.contentHtml),
          ...(parent
            ? {
                inReplyTo: {
                  postId: parent.postId,
                  author: parent.author,
                  ...(parent.rating !== null && parent.rating !== undefined
                    ? { score: parent.rating }
                    : {}),
                  content: textOf(parent),
                },
              }
            : {}),
        };
      });

    return JSON.stringify({ discussion: header, myReplies }, null, 2);
  }

  return JSON.stringify({ discussion: header, thread: (byParent.get(null) ?? []).map(node) }, null, 2);
}

type AiResult = {
  postId: string;
  name?: string;
  score: number;
  reply: string;
  ai_score?: number;
  duplicate_confidence?: number;
  duplicate_of?: string | null;
};

function ExportDialog({
  open,
  onClose,
  selectedPosts,
  allPosts,
  promptPost,
  discussionTitle,
  question,
  pedomanItems,
  onLoadDrafts,
}: {
  open: boolean;
  onClose: () => void;
  selectedPosts: Post[];
  allPosts: Post[];
  promptPost: Post | undefined;
  discussionTitle: string;
  question: string;
  pedomanItems: PedomanItem[];
  onLoadDrafts: (results: AiResult[]) => void;
}) {
  // With nothing left to grade, the grading tabs are empty — start on the thread.
  const [tab, setTab] = useState<"instruction" | "discussion" | "full" | "upload">(
    selectedPosts.length > 0 ? "instruction" : "full",
  );
  const [myRepliesOnly, setMyRepliesOnly] = useState(false);
  const [capStudentWords, setCapStudentWords] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [parseError, setParseError] = useState("");
  const [parsed, setParsed] = useState<AiResult[]>([]);

  const instruction = buildInstruction(promptPost, discussionTitle, question, pedomanItems);
  const discussionJson = buildDiscussionJson(selectedPosts);
  const fullThreadJson = buildFullThreadJson(allPosts, discussionTitle, question, {
    myRepliesOnly,
    maxStudentWords: capStudentWords ? STUDENT_WORD_CAP : 0,
  });

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
  }

  function parseUpload(text: string) {
    setUploadText(text);
    setParseError("");
    setParsed([]);
    if (!text.trim()) return;
    try {
      const raw = JSON.parse(text);
      const results: AiResult[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.results)
          ? raw.results
          : [];
      if (results.length === 0) { setParseError("No results array found."); return; }
      const valid = results.filter(
        (r) => typeof r.postId === "string" && typeof r.score === "number" && typeof r.reply === "string",
      );
      if (valid.length === 0) { setParseError("Items missing postId / score / reply fields."); return; }
      setParsed(valid);
    } catch (e) {
      setParseError(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function loadDrafts() {
    onLoadDrafts(parsed);
    setUploadText("");
    setParsed([]);
    onClose();
    toast.success(`Loaded ${parsed.length} draft${parsed.length !== 1 ? "s" : ""}`);
  }

  const tabs = [
    { id: "instruction" as const, label: "Instruction" },
    { id: "discussion" as const, label: `Batch (${selectedPosts.length})` },
    { id: "full" as const, label: `Full thread (${allPosts.length})` },
    { id: "upload" as const, label: "Import Result" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export for AI / Import Result</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-0 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto space-y-3 pt-3">
          {tab === "instruction" && (
            <>
              <p className="text-xs text-muted-foreground">
                Send this first to the AI to set context. Then send the Discussion JSON separately.
              </p>
              <Button size="sm" variant="outline" onClick={() => copy(instruction)}>
                Copy instruction
              </Button>
              <textarea
                readOnly
                value={instruction}
                className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none"
              />
            </>
          )}

          {tab === "discussion" && (
            <>
              <p className="text-xs text-muted-foreground">
                {selectedPosts.length === 0
                  ? "No students are selected for grading — use the Full thread tab to copy the whole discussion."
                  : "After the instruction, paste this JSON to the AI. It will return scored replies."}
              </p>
              <Button size="sm" variant="outline" onClick={() => copy(discussionJson)}>
                Copy JSON
              </Button>
              <textarea
                readOnly
                value={discussionJson}
                className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none"
              />
            </>
          )}

          {tab === "full" && (
            <>
              <p className="text-xs text-muted-foreground">
                {myRepliesOnly
                  ? "Only your own replies, each with the post it answers."
                  : "The complete thread, nested exactly as on UT, with your own replies inline (isMe: true) and any scores you have given."}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={myRepliesOnly}
                    onChange={(e) => setMyRepliesOnly(e.target.checked)}
                  />
                  Balasan saya saja
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={capStudentWords}
                    onChange={(e) => setCapStudentWords(e.target.checked)}
                  />
                  Batasi komentar mahasiswa {STUDENT_WORD_CAP} kata
                </label>
                <span className="ml-auto text-xs text-muted-foreground">
                  {(fullThreadJson.length / 1024).toFixed(1)} KB
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => copy(fullThreadJson)}>
                {myRepliesOnly ? "Copy my replies" : "Copy full thread"}
              </Button>
              <textarea
                readOnly
                value={fullThreadJson}
                className="w-full h-64 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none"
              />
            </>
          )}

          {tab === "upload" && (
            <>
              <p className="text-xs text-muted-foreground">
                Paste the AI JSON response. Preview, then load as drafts.
              </p>
              <Textarea
                value={uploadText}
                onChange={(e) => parseUpload(e.target.value)}
                rows={8}
                className="text-xs font-mono"
                placeholder={'{"results":[{"postId":"...","score":80,"reply":"..."}]}'}
              />
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
              {parsed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">{parsed.length} parsed:</p>
                  <div className="space-y-1 max-h-56 overflow-auto">
                    {parsed.map((r) => (
                      <div key={r.postId} className="rounded border p-2 text-xs space-y-1">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="font-semibold">{r.name ?? r.postId}</span>
                          {/* Grade score */}
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreColor(r.score)}`}>
                            Score {r.score}
                          </span>
                          {/* AI detection */}
                          {r.ai_score !== undefined && (
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${
                              r.ai_score >= 70
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              AI {r.ai_score}%
                            </span>
                          )}
                          {/* Duplicate */}
                          {r.duplicate_confidence !== undefined && r.duplicate_confidence > 0 && (
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${
                              r.duplicate_confidence >= 70
                                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                            }`}>
                              Copy {r.duplicate_confidence}%
                              {r.duplicate_of ? ` of ${parsed.find((x) => x.postId === r.duplicate_of)?.name ?? r.duplicate_of.slice(-6)}` : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground line-clamp-2">{r.reply}</p>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" onClick={loadDrafts}>
                    Load {parsed.length} as drafts
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiskusiActions({
  credentialId,
  courseId,
  forumId,
  discId,
  discussionUrl,
  posts,
  initialMeta,
}: {
  credentialId: string;
  courseId: string;
  forumId: string;
  discId: string;
  discussionUrl: string;
  posts: Post[];
  initialMeta: DiskusiMeta;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillId, setSkillId] = useState("");
  const [generatingOne, setGeneratingOne] = useState<string | null>(null);
  // draft + score lifted into results for "Post all" access
  const [results, setResults] = useState<GenerateResult[]>([]);
  const [postStatuses, setPostStatuses] = useState<Map<string, PostStatus>>(new Map());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(6);
  const [postingAll, setPostingAll] = useState(false);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const [draftsSavedAt, setDraftsSavedAt] = useState<string | null>(
    initialMeta.draftsUpdatedAt,
  );
  const [draftsDirty, setDraftsDirty] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Meta state
  const [question, setQuestion] = useState(initialMeta.question);
  const [pedomanItems, setPedomanItems] = useState<PedomanItem[]>(
    initialMeta.pedomanItems.length > 0
      ? initialMeta.pedomanItems
      : [{ id: genId(), criteria: "", maxScore: 100 }],
  );
  const [savingMeta, setSavingMeta] = useState(false);
  const [rubrikImportOpen, setRubrikImportOpen] = useState(false);
  const [rubrikImportText, setRubrikImportText] = useState("");

  // Manual reply-status override: postIds forced back to "not replied",
  // overriding auto-detection. Persisted in the diskusi meta doc.
  const [manualUnreplied, setManualUnreplied] = useState<Set<string>>(
    () => new Set(initialMeta.manualUnreplied),
  );

  async function persistManualUnreplied(next: Set<string>) {
    try {
      const res = await fetch(`/api/session-diskusi/${forumId}/${discId}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, manualUnreplied: [...next] }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      toast.error("Failed to save reply status");
    }
  }

  function markUnreplied(postId: string) {
    const next = new Set(manualUnreplied).add(postId);
    setManualUnreplied(next);
    persistManualUnreplied(next);
    toast.success("Marked as not replied");
  }

  function restoreReplied(postId: string) {
    const next = new Set(manualUnreplied);
    next.delete(postId);
    setManualUnreplied(next);
    persistManualUnreplied(next);
    toast.success("Restored as replied");
  }

  // Once a reply is posted, drop any "not replied" override so the post
  // doesn't stay stuck as unreplied after the next scrape/reload.
  function clearManualUnreplied(postIds: string[]) {
    if (!postIds.some((id) => manualUnreplied.has(id))) return;
    const next = new Set(manualUnreplied);
    for (const id of postIds) next.delete(id);
    setManualUnreplied(next);
    persistManualUnreplied(next);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/skills").then((r) => r.json()),
      fetch(`/api/credentials/${credentialId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([data, cred]) => {
        const list: Skill[] = data.items ?? [];
        setSkills(list);
        const preferred =
          list.find((s) => s.id === cred?.diskusiSkillId) ??
          list.find((s) => s.id === "default-diskusi") ??
          list[0];
        if (preferred) setSkillId(preferred.id);
      })
      .catch(() => {});
  }, [credentialId]);

  // Bring back drafts saved in a previous session so edits survive a reload.
  useEffect(() => {
    if (initialMeta.drafts.length === 0) return;
    setResults((prev) => {
      if (prev.length > 0) return prev;
      return initialMeta.drafts.map((d) => ({
        postId: d.postId,
        author: posts.find((p) => p.postId === d.postId)?.author ?? "",
        score: d.score ?? 0,
        draft: d.reply,
        replies: [d.reply],
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveDrafts() {
    if (results.length === 0) { toast.info("No drafts to save"); return; }
    setSavingDrafts(true);
    try {
      const res = await fetch(`/api/session-diskusi/${forumId}/${discId}/meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          courseId,
          drafts: results.map((r) => ({
            postId: r.postId,
            reply: r.draft,
            score: Number.isFinite(r.score) ? r.score : null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setDraftsSavedAt(new Date().toISOString());
      setDraftsDirty(false);
      toast.success(`Saved ${json.saved} draft${json.saved !== 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingDrafts(false);
    }
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/session-diskusi/${forumId}/${discId}/meta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, question, pedomanItems }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingMeta(false);
    }
  }

  function importRubrikJson() {
    try {
      const raw = JSON.parse(rubrikImportText.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
      const items: unknown = raw.pedomanItems;
      if (!Array.isArray(items) || items.length === 0) throw new Error("pedomanItems kosong");
      const parsed: PedomanItem[] = items.map((it: { criteria?: unknown; maxScore?: unknown }, i: number) => {
        if (typeof it.criteria !== "string" || !it.criteria.trim()) throw new Error(`Kriteria ${i + 1} kosong`);
        const max = Number(it.maxScore);
        if (it.maxScore === null || !Number.isFinite(max)) throw new Error(`Bobot kriteria ${i + 1} tidak valid`);
        return { id: genId(), criteria: it.criteria.trim(), maxScore: max };
      });
      setPedomanItems(parsed);
      if (typeof raw.question === "string" && raw.question.trim()) setQuestion(raw.question.trim());
      setRubrikImportText("");
      setRubrikImportOpen(false);
      const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((w: unknown) => typeof w === "string") : [];
      toast.success(`${parsed.length} kriteria dimuat, tekan Save untuk menyimpan`);
      if (warnings.length > 0) toast.warning(warnings.join(" | "));
    } catch (e) {
      toast.error(`Gagal import: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function copyRubrikInstruction() {
    try {
      await navigator.clipboard.writeText(RUBRIK_INSTRUCTION);
      toast.success("Instruksi rubrik disalin");
    } catch {
      toast.error("Gagal menyalin");
    }
  }

  function updatePedomanItem(index: number, field: keyof PedomanItem, value: string | number) {
    setPedomanItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  function addPedomanItem() {
    setPedomanItems((prev) => [...prev, { id: genId(), criteria: "", maxScore: 0 }]);
  }

  function removePedomanItem(index: number) {
    setPedomanItems((prev) => prev.filter((_, i) => i !== index));
  }

  const totalMax = pedomanItems.reduce((sum, item) => sum + item.maxScore, 0) || 100;

  // All non-tutor posts at any depth. Depth-0 thread-starters count in
  // each-student-own-discussion forums; depth>=1 covers session-diskusi and
  // off-thread nested replies.
  const allStudentPosts = posts.filter((p) => !p.isMyPost);

  // Only a child authored by me counts — students sometimes mis-post their own
  // answer as a reply under another student's post, which is not a reply.
  function myReplyFor(studentPostId: string): Post | undefined {
    return posts.find((p) => p.parentPostId === studentPostId && p.isMyPost);
  }

  // A post counts as replied only if it has a reply AND wasn't manually
  // flagged as not-replied by the lecturer.
  function isReplied(studentPostId: string): boolean {
    return !manualUnreplied.has(studentPostId) && !!myReplyFor(studentPostId);
  }

  const repliedStudents = allStudentPosts.filter((p) => isReplied(p.postId));
  const repliedNotScored = repliedStudents.filter((p) => p.rating === null);
  const doneStudents = repliedStudents.filter((p) => p.rating !== null);
  const unrepliedStudents = allStudentPosts.filter((p) => !isReplied(p.postId));

  const activeUnreplied = unrepliedStudents.filter((p) => !skipped.has(p.postId));

  function setStatus(postId: string, status: PostStatus) {
    setPostStatuses((prev) => new Map(prev).set(postId, status));
  }

  function updateDraft(postId: string, draft: string) {
    setResults((prev) => prev.map((r) => r.postId === postId ? { ...r, draft } : r));
    setDraftsDirty(true);
  }

  function updateScore(postId: string, score: number) {
    setResults((prev) => prev.map((r) => r.postId === postId ? { ...r, score } : r));
    setDraftsDirty(true);
  }

  function updateResult(updated: GenerateResult) {
    setResults((prev) => prev.map((r) => r.postId === updated.postId ? updated : r));
  }

  function toggleSkip(postId: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function selectAll() { setSkipped(new Set()); }
  function unselectAll() { setSkipped(new Set(unrepliedStudents.map((p) => p.postId))); }

  function loadAiDrafts(aiResults: AiResult[]) {
    setDraftsDirty(true);
    for (const r of aiResults) {
      const match = unrepliedStudents.find((p) => p.postId === r.postId);
      if (!match) continue;
      setResults((prev) => {
        const without = prev.filter((x) => x.postId !== r.postId);
        return [
          ...without,
          {
            postId: r.postId,
            author: r.name ?? match.author,
            score: r.score,
            draft: sanitizeDraft(r.reply),
            replies: [sanitizeDraft(r.reply)],
            aiScore: r.ai_score,
            duplicateConfidence: r.duplicate_confidence,
            duplicateOf: r.duplicate_of,
          },
        ];
      });
      setStatus(r.postId, "idle");
    }
  }

  function toResult(r: { postId: string; author: string; score: number; replies: string[] }): GenerateResult {
    return { ...r, draft: r.replies[0] ?? "" };
  }

  async function generateOne(post: Post) {
    if (!skillId) { toast.error("Select a skill first"); return; }
    setGeneratingOne(post.postId);
    try {
      const res = await fetch("/api/actions/generate-diskusi-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, courseId, forumId, discId, skillId, postIds: [post.postId] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const r = (json.results ?? []) as { postId: string; author: string; score: number; replies: string[] }[];
      if (r.length === 0) { toast.info("No reply generated"); return; }
      const incoming = toResult(r[0]);
      setResults((prev) => {
        const without = prev.filter((x) => x.postId !== post.postId);
        return [...without, incoming];
      });
      setStatus(post.postId, "idle");
      toast.success(`Generated reply for ${post.author}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setGeneratingOne(null);
    }
  }

  function manualReply(post: Post) {
    setResults((prev) => {
      if (prev.some((x) => x.postId === post.postId)) return prev;
      return [...prev, { postId: post.postId, author: post.author, score: 0, draft: "", replies: [] }];
    });
    setStatus(post.postId, "idle");
  }

  // Only drafts for students still awaiting a reply AND currently selected.
  // `results` can hold stale drafts (restored from a saved session, or for
  // students already replied/unselected) that must not be posted.
  function isPostable(r: GenerateResult): boolean {
    return (
      (postStatuses.get(r.postId) ?? "idle") !== "done" &&
      activeUnreplied.some((p) => p.postId === r.postId)
    );
  }

  async function postAll() {
    const pending = results.filter((r) => isPostable(r) && r.draft.trim());
    if (pending.length === 0) { toast.info("No pending drafts"); return; }
    setPostingAll(true);
    try {
      const res = await fetch("/api/actions/post-diskusi-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId, courseId, forumId, discId, discussionUrl,
          items: pending.map((r) => ({ postId: r.postId, reply: sanitizeDraft(r.draft), score: r.score })),
          delayMin, delayMax,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const posted: string[] = [];
      for (const item of json.results ?? []) {
        const ok = item.status !== "error";
        setStatus(item.postId, ok ? "done" : "error");
        if (ok) posted.push(item.postId);
      }
      clearManualUnreplied(posted);
      const ok = (json.results ?? []).filter((x: { status: string }) => x.status !== "error").length;
      toast.success(`Posted ${ok} of ${pending.length} replies`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPostingAll(false);
    }
  }

  // One unreplied student: their post + the inline reply/score workflow.
  // (Lifted out of the thread so "current work" is a focused list, not buried
  // among the already-handled posts.)
  function renderUnrepliedCard(p: Post) {
    const status = postStatuses.get(p.postId) ?? "idle";
    const isDone = status === "done";
    const isSkipped = skipped.has(p.postId);
    const result = results.find((r) => r.postId === p.postId);
    const busy = generatingOne === p.postId;
    const isForcedUnreplied = manualUnreplied.has(p.postId);
    const date = p.datetimeIso
      ? new Date(p.datetimeIso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
      : "";

    return (
      <div
        key={p.postId}
        id={`post-${p.postId}`}
        className={`rounded-lg border p-4 space-y-3 ${
          isDone
            ? "opacity-60"
            : "border-red-200 bg-red-50/30 dark:border-red-900/60 dark:bg-red-950/10"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{p.author}</span>
          {isDone ? (
            <Badge variant="default" className="text-xs">Posted</Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">Needs reply</Badge>
          )}
          {date && <span className="text-xs text-muted-foreground">{date}</span>}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <a
              href={`${discussionUrl}#p${p.postId}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
              title="Open this post on UT"
            >
              Open on UT ↗
            </a>
            {p.authorUrl && (
              <a
                href={p.authorUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground"
                title="Open author profile on UT"
              >
                Profile ↗
              </a>
            )}
          </div>
        </div>

        <CollapsibleContent html={p.contentHtml} />

        {hasEmDash(stripHtml(p.contentHtml)) && (
          <div>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
              ⚠ Em dash detected — likely AI
            </span>
          </div>
        )}

        {isForcedUnreplied && (
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-muted text-muted-foreground">
              Manually flagged not replied
            </span>
            <button
              type="button"
              onClick={() => restoreReplied(p.postId)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Restore as replied
            </button>
          </div>
        )}

        {!isDone && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={!isSkipped} onChange={() => toggleSkip(p.postId)} title="Uncheck to skip from batch" />
              Include in batch
            </label>
            {!result && (
              <>
                <Button size="sm" variant="outline" onClick={() => generateOne(p)} disabled={busy || !skillId}>
                  {busy ? "..." : "AI Reply"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => manualReply(p)}>
                  Manual
                </Button>
              </>
            )}
          </div>
        )}

        {result && (
          <InlineDraftCard
            result={result}
            post={p}
            posts={posts}
            status={status}
            regenerating={generatingOne === p.postId}
            credentialId={credentialId}
            courseId={courseId}
            forumId={forumId}
            discId={discId}
            discussionUrl={discussionUrl}
            delayMin={delayMin}
            delayMax={delayMax}
            skillId={skillId}
            onDraftChange={(draft) => updateDraft(p.postId, draft)}
            onScoreChange={(score) => updateScore(p.postId, score)}
            onDone={() => { setStatus(p.postId, "done"); clearManualUnreplied([p.postId]); }}
            onRegenerate={() => generateOne(p)}
          />
        )}
      </div>
    );
  }

  if (allStudentPosts.length === 0) return null;

  const pendingCount = results.filter(isPostable).length;

  return (
    <div className="space-y-5">

      {/* ── Status bar (sticky, at-a-glance state) ── */}
      <StatusBar
        needsReply={unrepliedStudents.length}
        awaitingScore={repliedNotScored.length}
        done={doneStudents.length}
        total={allStudentPosts.length}
      />

      {/* ── Setup (collapsed): discussion question + pedoman penilaian ── */}
      <Section title="Setup — Discussion question & Pedoman penilaian" defaultOpen={false}>
        <p className="text-xs font-medium text-muted-foreground">Discussion question / prompt</p>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          placeholder="Paste the discussion question / prompt here..."
          className="text-sm"
        />
        <Button size="sm" onClick={saveMeta} disabled={savingMeta}>
          {savingMeta ? "Saving..." : "Save"}
        </Button>

        <hr className="my-1 border-border" />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={copyRubrikInstruction}>
            Copy instruksi rubrik
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRubrikImportOpen((v) => !v)}
          >
            Import rubrik JSON
          </Button>
        </div>
        {rubrikImportOpen && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Tempel JSON hasil AI (question + pedomanItems). Ini menggantikan kriteria di bawah, lalu tekan Save.
            </p>
            <Textarea
              value={rubrikImportText}
              onChange={(e) => setRubrikImportText(e.target.value)}
              rows={6}
              placeholder={'{"question":"...","pedomanItems":[{"id":"1","criteria":"...","maxScore":20}]}'}
              className="font-mono text-xs"
            />
            <Button type="button" size="sm" onClick={importRubrikJson} disabled={!rubrikImportText.trim()}>
              Load
            </Button>
          </div>
        )}

        <p className="text-xs font-medium text-muted-foreground">
          Pedoman penilaian{totalMax > 0 ? ` (Total maks. ${totalMax} poin)` : ""}
        </p>
        <div className="space-y-2">
          {pedomanItems.map((item, i) => (
            <div key={item.id} className="flex items-start gap-2">
              <div className="flex-1">
                <Textarea
                  value={item.criteria}
                  onChange={(e) => updatePedomanItem(i, "criteria", e.target.value)}
                  rows={2}
                  placeholder={`Kriteria ${i + 1}…`}
                  className="text-sm"
                />
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Maks.</label>
                <Input
                  type="number"
                  min={0}
                  value={item.maxScore}
                  onChange={(e) => updatePedomanItem(i, "maxScore", Number(e.target.value))}
                  className="w-20 text-center text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => removePedomanItem(i)}
                disabled={pedomanItems.length === 1}
                className="mt-6 text-muted-foreground hover:text-destructive disabled:opacity-30 text-sm leading-none"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={addPedomanItem}>
              + Add criterion
            </Button>
            <span className="text-xs text-muted-foreground">
              Total maks. <strong>{totalMax}</strong> poin
            </span>
          </div>
        </div>
        <Button size="sm" onClick={saveMeta} disabled={savingMeta}>
          {savingMeta ? "Saving..." : "Save"}
        </Button>
      </Section>

      {/* ── Needs your reply (the current work) ── */}
      {unrepliedStudents.length > 0 ? (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
          Needs your reply ({unrepliedStudents.length})
        </h2>
      <div className="rounded-lg border p-4 space-y-4">
        <SkillManager skills={skills} selectedId={skillId} onSelect={setSkillId} onSkillsChange={setSkills} />

        {unrepliedStudents.length > 0 && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Delay (sec)</label>
              <div className="flex items-center gap-1.5">
                <Input type="number" min={1} max={600} value={delayMin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelayMin(Number(e.target.value))} className="w-16 h-8 text-center" />
                <span className="text-sm text-muted-foreground">–</span>
                <Input type="number" min={1} max={600} value={delayMax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelayMax(Number(e.target.value))} className="w-16 h-8 text-center" />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={saveDrafts}
              disabled={savingDrafts || results.length === 0}
            >
              {savingDrafts ? "Saving..." : `Save drafts (${results.length})`}
            </Button>
            <Button onClick={postAll} disabled={postingAll || pendingCount === 0}>
              {postingAll ? "Posting..." : `Post to UT (${pendingCount})`}
            </Button>
            {results.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Import an AI result first to load drafts.
              </span>
            ) : draftsDirty ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Unsaved changes
              </span>
            ) : draftsSavedAt ? (
              <span className="text-xs text-muted-foreground">
                Saved {new Date(draftsSavedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        )}
        {/* Select all / unselect all / export */}
        {unrepliedStudents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
            <Button size="sm" variant="ghost" onClick={selectAll} disabled={skipped.size === 0}>
              Select all
            </Button>
            <Button size="sm" variant="ghost" onClick={unselectAll} disabled={skipped.size === unrepliedStudents.length}>
              Unselect all
            </Button>
            <span className="text-xs text-muted-foreground">
              {activeUnreplied.length} of {unrepliedStudents.length} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => setShowExport(true)}
            >
              Download JSON ({activeUnreplied.length})
            </Button>
          </div>
        )}
      </div>

        {/* One card per unreplied student — the focused work list */}
        {unrepliedStudents.map((p) => renderUnrepliedCard(p))}
      </section>
      ) : (
        <div className="space-y-2 rounded-lg border border-green-300 bg-green-50/50 p-4 text-center dark:border-green-800 dark:bg-green-950/20">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            ✓ Every student has been replied to.
          </p>
          {posts.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowExport(true)}>
              Download JSON ({posts.length} posts)
            </Button>
          )}
        </div>
      )}

      {/* Export / Upload dialog */}
      {showExport && (
        <ExportDialog
          open={showExport}
          onClose={() => setShowExport(false)}
          selectedPosts={activeUnreplied}
          allPosts={posts}
          promptPost={posts.find((p) => p.depth === 0)}
          discussionTitle={posts.find((p) => p.depth === 0)?.subject || "Diskusi"}
          question={question}
          pedomanItems={pedomanItems}
          onLoadDrafts={loadAiDrafts}
        />
      )}

      {/* ── Awaiting score (replied, no rating yet) ── */}
      {repliedNotScored.length > 0 && (
        <Group title={`Awaiting score (${repliedNotScored.length})`} tone="amber" defaultOpen>
          {repliedNotScored.map((p) => (
            <RepliedStudentCard key={p.postId} post={p} myReply={myReplyFor(p.postId)!} noScore onMarkUnreplied={() => markUnreplied(p.postId)} />
          ))}
        </Group>
      )}

      {/* ── Done (replied + scored), collapsed ── */}
      {doneStudents.length > 0 && (
        <Group title={`Done (${doneStudents.length})`} defaultOpen={false}>
          {doneStudents.map((p) => (
            <RepliedStudentCard key={p.postId} post={p} myReply={myReplyFor(p.postId)!} onMarkUnreplied={() => markUnreplied(p.postId)} />
          ))}
        </Group>
      )}

      {/* ── Full thread for context, collapsed (read-only; reply from the section above) ── */}
      <Group title={`Full thread for context (${posts.length} post${posts.length !== 1 ? "s" : ""})`} defaultOpen={false}>
        <PostThread
          posts={posts}
          renderActions={(p) => {
            if (p.isMyPost) return null;
            if (isReplied(p.postId)) {
              return (
                <button
                  type="button"
                  onClick={() => markUnreplied(p.postId)}
                  className="text-xs text-muted-foreground hover:text-destructive whitespace-nowrap"
                  title="Move this student back into the reply workflow"
                >
                  Mark not replied
                </button>
              );
            }
            return (
              <Badge variant="destructive" className="text-xs">
                Needs reply ↑
              </Badge>
            );
          }}
        />
      </Group>
    </div>
  );
}
