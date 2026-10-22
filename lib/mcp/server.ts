// MCP server exposing the app's actions as tools.
//
// Tools call the existing route handlers in-process (no HTTP hop), so the
// REST API and MCP share validation, locking and logic. See AGENT_API.md.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { NextRequest } from "next/server";
import { z } from "zod";

import { GET as getCredentials } from "@/app/api/credentials/route";
import { GET as getSkills } from "@/app/api/skills/route";
import { GET as getDiscussions } from "@/app/api/discussions/route";
import { GET as getSessionDiskusi } from "@/app/api/session-diskusi/route";
import { GET as getSessions } from "@/app/api/sessions/route";
import { GET as getTugas } from "@/app/api/tugas/[assignId]/route";

import { POST as login } from "@/app/api/actions/login/route";
import { POST as resetSession } from "@/app/api/actions/reset-session/route";
import { POST as collectCourses } from "@/app/api/actions/courses/route";
import { POST as collectSessions } from "@/app/api/actions/sessions/route";
import { POST as collectIntroForum } from "@/app/api/actions/intro-forum/route";
import { POST as collectDiscussions } from "@/app/api/actions/discussions/route";
import { POST as collectSessionDiskusi } from "@/app/api/actions/session-diskusi/route";
import { POST as collectCourseDiskusi } from "@/app/api/actions/course-diskusi/route";
import { POST as collectTugas } from "@/app/api/actions/tugas/route";
import { POST as collectGradebook } from "@/app/api/actions/gradebook/route";
import { POST as collectMaterial } from "@/app/api/actions/collect-material/route";
import { POST as collectRubrikDiskusi } from "@/app/api/actions/rubrik-diskusi/route";

import { POST as generateDiskusiReplies } from "@/app/api/actions/generate-diskusi-replies/route";
import { POST as generateReplies } from "@/app/api/actions/generate-replies/route";
import { POST as generateReply } from "@/app/api/actions/generate-reply/route";
import { POST as evaluateTugas } from "@/app/api/actions/evaluate-tugas/route";

import { POST as postDiskusiReplies } from "@/app/api/actions/post-diskusi-replies/route";
import { POST as postReplies } from "@/app/api/actions/post-replies/route";
import { POST as gradeTugas } from "@/app/api/actions/grade-tugas/route";

import { listCourses } from "@/lib/courses";
import { getCredential } from "@/lib/credentials";
import path from "path";
import { listRubrikFiles } from "@/lib/rubrik-diskusi";
import { RUBRIK_FILES_BASE } from "@/lib/playwright/ut-rubrik";
import { recentLogs } from "@/lib/activity-log";
import { buildScoreMonitor } from "@/lib/gradebook";
import TurndownService from "turndown";
import { listSessionPosts, getDiskusiMeta, saveDiskusiDrafts } from "@/lib/session-diskusi";
import { cleanPostHtml } from "@/lib/post-html";
import { getDiscussion } from "@/lib/discussions";
import { listTugasSubmissions, saveAiEval } from "@/lib/tugas";
import { MODEL } from "@/lib/gemini";
import { startJob, getJob, listJobs, type Job } from "@/lib/mcp/jobs";

const BASE = "http://internal";

type Handler = (req: NextRequest, ctx: never) => Promise<Response>;

async function toResult(res: Response): Promise<CallToolResult> {
  const text = await res.text();
  // evaluate-tugas streams NDJSON (one line per student); hand the agent one array.
  if (res.ok && res.headers.get("content-type")?.includes("ndjson")) {
    const results = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return json({ results });
  }
  return { content: [{ type: "text", text }], isError: !res.ok };
}

function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

async function post(handler: Handler, body: unknown): Promise<CallToolResult> {
  const req = new NextRequest(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return toResult(await handler(req, undefined as never));
}

async function get(
  handler: Handler,
  path: string,
  query: Record<string, string> = {},
  params?: Record<string, string>,
): Promise<CallToolResult> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const ctx = params ? { params: Promise.resolve(params) } : undefined;
  return toResult(await handler(new NextRequest(url), ctx as never));
}

function jobView(job: Job) {
  const { result, ...rest } = job;
  return { ...rest, result: result?.content[0]?.type === "text" ? result.content[0].text : undefined };
}

const id = z.string().min(1);
const credentialId = id.describe("Credential id from list_credentials");
const courseId = id.describe("Course id from list_courses");
const forumId = id.describe("Diskusi forum id (from get_sessions)");
const discId = id.describe("Discussion thread id (?d= param), from get_session_diskusi");
const assignId = id.describe("Assignment id (from get_sessions)");
const skillId = id.describe("Skill id from list_skills");

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
// Collect tools drive the UT browser and overwrite stored snapshots, but never
// change anything on UT itself.
const COLLECT: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
// AI tools call Gemini and store drafts/evaluations locally; nothing reaches UT.
const AI: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
// Write tools change what students see on UT.
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

const QUEUE_NOTE =
  " Calls on the same credential run one at a time (they queue); do not retry a call that is still running.";
const BACKGROUND_NOTE = " Pass background: true to get a jobId immediately and poll get_job.";
const DRY_RUN_NOTE =
  " dryRun defaults to TRUE and only returns a preview; show it to the user and get explicit approval before calling again with dryRun: false.";

const background = z
  .boolean()
  .optional()
  .describe("Run as a background job and return a jobId at once; poll get_job for the result");

type Shape = z.ZodRawShape;
type Args<S extends Shape> = z.infer<z.ZodObject<S>>;

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "ut-assistant", version: "0.2.0" });

  function tool<S extends Shape>(
    name: string,
    config: { description: string; inputSchema?: S; annotations: ToolAnnotations },
    run: (args: Args<S>) => Promise<CallToolResult>,
  ) {
    server.registerTool(name, config, run as never);
  }

  // A tool that may outlive the client's tool-call timeout: adds `background`.
  function longTool<S extends Shape>(
    name: string,
    config: { description: string; inputSchema: S; annotations: ToolAnnotations },
    run: (args: Args<S>) => Promise<CallToolResult>,
  ) {
    server.registerTool(
      name,
      {
        ...config,
        description: config.description + QUEUE_NOTE + BACKGROUND_NOTE,
        inputSchema: { ...config.inputSchema, background },
      },
      (async ({ background, ...args }: Args<S> & { background?: boolean }) => {
        if (!background) return run(args as Args<S>);
        const job = startJob(name, args, () => run(args as Args<S>));
        return json({ jobId: job.id, status: job.status });
      }) as never,
    );
  }

  // ---- Jobs ----

  tool(
    "get_job",
    {
      description: "Status and result of a background job started with background: true. Poll every 15-30s while status is running.",
      inputSchema: { jobId: id },
      annotations: READ,
    },
    async ({ jobId }) => {
      const job = getJob(jobId);
      if (!job) return { content: [{ type: "text", text: "Job not found (jobs are lost on server restart)" }], isError: true };
      return json(jobView(job));
    },
  );

  tool(
    "list_jobs",
    { description: "Recent background jobs, newest first (without results; use get_job).", annotations: READ },
    async () =>
      json({
        items: listJobs().map(({ id, tool, status, startedAt, finishedAt }) => ({ id, tool, status, startedAt, finishedAt })),
      }),
  );

  // ---- Read: stored data, no browser ----

  tool(
    "list_credentials",
    {
      description: "List saved UT LMS credentials (id, label, username, diskusiSkillId = configured reply skill). Start here.",
      annotations: READ,
    },
    () => get(getCredentials as Handler, "/api/credentials"),
  );

  tool(
    "list_skills",
    { description: "List AI skills (prompt templates) used to generate replies and evaluate tugas.", annotations: READ },
    () => get(getSkills as Handler, "/api/skills"),
  );

  tool(
    "list_courses",
    {
      description: "List stored courses for a credential. Empty until collect_courses has run.",
      inputSchema: { credentialId },
      annotations: READ,
    },
    async ({ credentialId }) => json({ items: await listCourses(credentialId) }),
  );

  tool(
    "get_sessions",
    {
      description: "Stored course sessions, including their diskusi forums and tugas (assignment) activities. Run collect_sessions first.",
      inputSchema: { credentialId, courseId },
      annotations: READ,
    },
    (args) => get(getSessions as Handler, "/api/sessions", args),
  );

  tool(
    "get_discussions",
    {
      description: "Stored intro-forum (Forum Perkenalan) discussions and posts. Run collect_discussions first.",
      inputSchema: { credentialId, courseId },
      annotations: READ,
    },
    (args) => get(getDiscussions as Handler, "/api/discussions", args),
  );

  tool(
    "get_session_diskusi",
    {
      description: "Stored threads and student posts for a session diskusi forum. Run collect_session_diskusi first.",
      inputSchema: { credentialId, courseId, forumId },
      annotations: READ,
    },
    (args) => get(getSessionDiskusi as Handler, "/api/session-diskusi", args),
  );

  tool(
    "get_diskusi_posts",
    {
      description:
        "Posts in one session diskusi thread (content as markdown), plus the discussion question, pedoman penilaian and any saved reply drafts. " +
        "Use the postIds here for generate_diskusi_replies and post_diskusi_replies. " +
        "Student posts are long (often 5-10k chars each); filter with unrepliedOnly or postIds where possible.",
      inputSchema: {
        credentialId,
        courseId,
        forumId,
        discId,
        unrepliedOnly: z.boolean().optional().describe("Only student posts the lecturer has not replied to yet"),
        postIds: z.array(z.string()).optional().describe("Only these posts"),
        includeContent: z.boolean().optional().describe("Default true. false lists posts without their text, to page through by postIds"),
      },
      annotations: READ,
    },
    async ({ credentialId, courseId, forumId, discId, unrepliedOnly, postIds, includeContent = true }) => {
      const [posts, meta] = await Promise.all([
        listSessionPosts(credentialId, courseId, forumId, discId),
        getDiskusiMeta(credentialId, courseId, forumId, discId),
      ]);
      const manualUnreplied = new Set(meta.manualUnreplied);
      const selected = posts
        .filter((p) => !postIds || postIds.includes(p.postId))
        .filter((p) => !unrepliedOnly || (!p.isMyPost && (!p.iRepliedToThis || manualUnreplied.has(p.postId))))
        .sort((a, b) => a.datetimeIso.localeCompare(b.datetimeIso));
      const selectedIds = new Set(selected.map((p) => p.postId));
      const td = new TurndownService();
      return json({
        question: meta.question,
        pedomanItems: meta.pedomanItems,
        totalPosts: posts.length,
        drafts: meta.drafts.filter((d) => selectedIds.has(d.postId)),
        posts: selected.map(({ contentHtml, ...p }) =>
          includeContent ? { ...p, content: td.turndown(cleanPostHtml(contentHtml)) } : p,
        ),
      });
    },
  );

  tool(
    "get_rubrik_diskusi",
    {
      description:
        "Stored rubric files (PDF) for a diskusi forum, with absolute paths on the server machine so a local agent can read them. " +
        "Run collect_rubrik_diskusi first.",
      inputSchema: { credentialId, courseId, forumId },
      annotations: READ,
    },
    async ({ credentialId, courseId, forumId }) => {
      const files = await listRubrikFiles(credentialId, courseId, forumId);
      return json({
        items: files.map((f) => ({ ...f, absolutePath: path.join(RUBRIK_FILES_BASE, f.localPath) })),
      });
    },
  );

  tool(
    "get_gradebook",
    {
      description:
        "Score monitor for a course from the latest stored gradebook snapshot: one row per student x graded activity, " +
        "with the LMS grade and whether the student has work (a diskusi post or tugas submission) that is still unscored. " +
        "Run collect_gradebook to refresh.",
      inputSchema: {
        credentialId,
        courseId,
        missingOnly: z.boolean().optional().describe("Only rows where the student has work but no score yet. Default false"),
      },
      annotations: READ,
    },
    async ({ credentialId, courseId, missingOnly }) => {
      // The REST response repeats the full student + item on every row (~600KB
      // for a 50-student course); flatten it to what an agent needs.
      const { snapshot, rows, summary } = await buildScoreMonitor(credentialId, courseId);
      return json({
        collectedAt: snapshot.collectedAt,
        summary,
        items: snapshot.items.map(({ itemId, kind, name, activityId }) => ({ itemId, kind, name, activityId })),
        rows: rows
          .filter((r) => !missingOnly || r.missingScore)
          .map((r) => ({
            itemId: r.item.itemId,
            userId: r.student.uid,
            studentNo: r.student.studentNo,
            name: r.student.name,
            grade: r.lmsGrade,
            hasWork: r.evidence?.exists ?? false,
            hasTutorReply: r.evidence?.hasTutorReply,
            missingScore: r.missingScore,
            url: r.evidence?.url,
          })),
      });
    },
  );

  tool(
    "get_tugas_submissions",
    {
      description: "Stored submissions for an assignment (tugas), including any AI evaluation. Run collect_tugas first.",
      inputSchema: { credentialId, courseId, assignId },
      annotations: READ,
    },
    ({ assignId, ...query }) =>
      get(getTugas as Handler, `/api/tugas/${encodeURIComponent(assignId)}`, query, { assignId }),
  );

  tool(
    "get_activity_log",
    {
      description: "Recent server activity log lines (progress of running and past actions).",
      inputSchema: { limit: z.number().int().min(1).max(500).optional().describe("Default 50") },
      annotations: READ,
    },
    async ({ limit }) => json({ items: recentLogs(limit ?? 50) }),
  );

  // ---- Collect: drive the UT browser, store results ----

  longTool(
    "login",
    {
      description: "Log into UT LMS with a credential and persist the browser session. Other tools log in automatically when needed.",
      inputSchema: { credentialId },
      annotations: COLLECT,
    },
    (args) => post(login as Handler, args),
  );

  longTool(
    "reset_session",
    {
      description: "Close the credential's browser so the next action relaunches it. Use when actions keep failing or hang.",
      inputSchema: { credentialId },
      annotations: COLLECT,
    },
    (args) => post(resetSession as Handler, args),
  );

  longTool(
    "collect_courses",
    {
      description: "Scrape and store the course list from UT (/my/courses.php).",
      inputSchema: {
        credentialId,
        semesterId: id.optional().describe("Semester to file the snapshot under; defaults to current"),
        createSemester: z.boolean().optional().describe("Create the semester snapshot if missing"),
      },
      annotations: COLLECT,
    },
    (args) => post(collectCourses as Handler, args),
  );

  longTool(
    "collect_sessions",
    {
      description: "Scrape and store a course's sessions, with their diskusi forums and tugas activities.",
      inputSchema: { credentialId, courseId },
      annotations: COLLECT,
    },
    (args) => post(collectSessions as Handler, args),
  );

  longTool(
    "collect_intro_forum",
    {
      description: "Locate and store the course's Forum Perkenalan (intro forum) URL.",
      inputSchema: { credentialId, courseId },
      annotations: COLLECT,
    },
    (args) => post(collectIntroForum as Handler, args),
  );

  longTool(
    "collect_discussions",
    {
      description: "Scrape and store intro-forum discussions and posts. Can take a few minutes.",
      inputSchema: { credentialId, courseId },
      annotations: COLLECT,
    },
    (args) => post(collectDiscussions as Handler, args),
  );

  longTool(
    "collect_session_diskusi",
    {
      description: "Scrape and store all threads and posts of one session diskusi forum. Can take a few minutes.",
      inputSchema: { credentialId, courseId, forumId },
      annotations: COLLECT,
    },
    (args) => post(collectSessionDiskusi as Handler, args),
  );

  longTool(
    "collect_course_diskusi",
    {
      description:
        "Scrape every session diskusi forum in a course (needs collect_sessions first; continues past per-forum failures). Can take up to 10 minutes.",
      inputSchema: { credentialId, courseId },
      annotations: COLLECT,
    },
    (args) => post(collectCourseDiskusi as Handler, args),
  );

  longTool(
    "collect_rubrik_diskusi",
    {
      description: "Download and store the grading rubric for a diskusi forum.",
      inputSchema: { credentialId, courseId, forumId },
      annotations: COLLECT,
    },
    (args) => post(collectRubrikDiskusi as Handler, args),
  );

  longTool(
    "collect_tugas",
    {
      description: "Scrape and store an assignment's submissions, optionally downloading files. Can take a few minutes.",
      inputSchema: {
        credentialId,
        courseId,
        assignId,
        downloadFiles: z.boolean().optional().describe("Default true"),
        collectScope: z.enum(["all", "requiresGrading"]).optional().describe("Default all"),
      },
      annotations: COLLECT,
    },
    (args) => post(collectTugas as Handler, args),
  );

  longTool(
    "collect_gradebook",
    {
      description: "Scrape and store a fresh gradebook snapshot (student scores) for a course.",
      inputSchema: { credentialId, courseId },
      annotations: COLLECT,
    },
    (args) => post(collectGradebook as Handler, args),
  );

  longTool(
    "collect_material",
    {
      description: "Download and store course material (materi) for every session. Can take up to 10 minutes.",
      inputSchema: { credentialId, courseId },
      annotations: COLLECT,
    },
    (args) => post(collectMaterial as Handler, args),
  );

  // ---- AI: Gemini drafts and evaluations (stored locally, not posted) ----

  longTool(
    "generate_diskusi_replies",
    {
      description:
        "AI: score and draft a lecturer reply for each student post in a session diskusi thread, using the credential's " +
        "configured diskusi skill. Nothing is posted; pass the (optionally edited) drafts to post_diskusi_replies.",
      inputSchema: {
        credentialId,
        courseId,
        forumId,
        discId,
        skillId: skillId.optional().describe("Override the credential's configured diskusi skill"),
        maxStudents: z.number().int().min(1).max(200).optional(),
        postIds: z.array(z.string()).optional().describe("Only draft for these post ids"),
      },
      annotations: AI,
    },
    async ({ skillId, ...args }) => {
      const resolved = skillId ?? (await getCredential(args.credentialId))?.diskusiSkillId;
      if (!resolved)
        return {
          content: [{ type: "text", text: "No diskusi skill configured for this credential; pass skillId (see list_skills)." }],
          isError: true,
        };
      return post(generateDiskusiReplies as Handler, { ...args, skillId: resolved });
    },
  );

  longTool(
    "generate_replies",
    {
      description:
        "AI: draft replies for every intro-forum (Forum Perkenalan) discussion still needing a reply, across courses. " +
        "Nothing is posted; pass the drafts to post_replies.",
      inputSchema: { credentialId, skillId: skillId.optional().describe("Default forum-perkenalan") },
      annotations: AI,
    },
    (args) => post(generateReplies as Handler, args),
  );

  longTool(
    "generate_reply",
    {
      description: "AI: draft one intro-forum reply for a single discussion. Nothing is posted.",
      inputSchema: {
        credentialId,
        courseId,
        discussionId: id.describe("Intro-forum discussion id, from get_discussions"),
        skillId: skillId.optional().describe("Default forum-perkenalan"),
      },
      annotations: AI,
    },
    (args) => post(generateReply as Handler, args),
  );

  longTool(
    "evaluate_tugas",
    {
      description:
        "AI: evaluate stored tugas submissions against the assignment's pedoman, returning per-criterion scores, total score and feedback per student. " +
        "Results are saved as AI evaluations; nothing is posted. Pass them to grade_tugas. Run collect_tugas first. " +
        "Takes ~10-30s per student, so prefer background: true for whole classes.",
      inputSchema: {
        credentialId,
        courseId,
        assignId,
        skillId,
        model: z.string().optional().describe(`Gemini model id. Default ${MODEL}`),
        userIds: z.array(z.string()).optional().describe("Only evaluate these students"),
      },
      annotations: AI,
    },
    ({ model, ...args }) => post(evaluateTugas as Handler, { ...args, model: model ?? MODEL }),
  );

  tool(
    "save_diskusi_drafts",
    {
      description:
        "Save reply drafts (reply + score) for posts in a session diskusi thread, so the lecturer can review and edit them in the web UI " +
        "before posting. Merges by postId with existing drafts. Nothing is posted to UT.",
      inputSchema: {
        credentialId,
        courseId,
        forumId,
        discId,
        drafts: z
          .array(
            z.object({
              postId: id,
              reply: z.string(),
              score: z.number().int().min(0).max(100).nullable().optional(),
            }),
          )
          .min(1),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ credentialId, courseId, forumId, discId, drafts }) => {
      const meta = await getDiskusiMeta(credentialId, courseId, forumId, discId);
      const merged = new Map(meta.drafts.map((d) => [d.postId, d]));
      for (const d of drafts) merged.set(d.postId, { postId: d.postId, reply: d.reply, score: d.score ?? null });
      await saveDiskusiDrafts(credentialId, courseId, forumId, discId, [...merged.values()]);
      return json({ ok: true, saved: drafts.length, totalDrafts: merged.size });
    },
  );

  tool(
    "save_tugas_eval",
    {
      description:
        "Save an evaluation draft (per-criterion scores, total and feedback) for a tugas submission as its AI evaluation, " +
        "so the lecturer can review it in the web UI. Overwrites any existing AI evaluation for that student. Nothing is posted to UT.",
      inputSchema: {
        credentialId,
        courseId,
        assignId,
        userId: id.describe("Student userId from get_tugas_submissions"),
        criteriaScores: z
          .array(z.object({ id: z.string(), criteria: z.string(), score: z.number().min(0), maxScore: z.number().min(0) }))
          .describe("Empty for feedback-only assignments such as Artikel Ilmiah"),
        totalScore: z.number().min(0).max(100),
        reasoning: z.string().describe("Basis for the scores; not shown to the student"),
        feedback: z.string().describe("Feedback text for the student"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ credentialId, courseId, assignId, userId, ...eval_ }) => {
      await saveAiEval(credentialId, courseId, assignId, userId, eval_);
      return json({ ok: true });
    },
  );

  // ---- Write: post to UT (student-visible) ----

  longTool(
    "post_diskusi_replies",
    {
      description:
        "Post lecturer replies (and optional ratings) to student posts in a session diskusi thread on UT. Student-visible." +
        DRY_RUN_NOTE,
      inputSchema: {
        credentialId,
        courseId,
        forumId,
        discId,
        items: z
          .array(
            z.object({
              postId: id,
              reply: id.describe("Reply text"),
              score: z.number().int().min(0).max(100).optional().describe("Rating to give the post"),
            }),
          )
          .min(1),
        delayMin: z.number().min(1).max(600).optional().describe("Seconds between posts. Default 5"),
        delayMax: z.number().min(1).max(600).optional().describe("Default 6"),
        dryRun: z.boolean().optional().describe("Default true"),
      },
      annotations: WRITE,
    },
    async ({ dryRun = true, ...args }) => {
      const discussionUrl = `https://elearning.ut.ac.id/mod/forum/discuss.php?d=${encodeURIComponent(args.discId)}`;
      if (!dryRun) return post(postDiskusiReplies as Handler, { ...args, discussionUrl });

      const posts = await listSessionPosts(args.credentialId, args.courseId, args.forumId, args.discId);
      const byId = new Map(posts.map((p) => [p.postId, p]));
      return json({
        dryRun: true,
        discussionUrl,
        items: args.items.map((item) => {
          const p = byId.get(item.postId);
          return {
            ...item,
            found: !!p,
            author: p?.author,
            isMyPost: p?.isMyPost,
            alreadyReplied: p?.iRepliedToThis,
          };
        }),
      });
    },
  );

  longTool(
    "post_replies",
    {
      description: "Post lecturer replies to intro-forum (Forum Perkenalan) discussions on UT. Student-visible." + DRY_RUN_NOTE,
      inputSchema: {
        credentialId,
        items: z
          .array(
            z.object({
              discussionId: id,
              courseId,
              discussionUrl: z.string().url(),
              reply: id.describe("Reply text"),
            }),
          )
          .min(1),
        delayMin: z.number().min(1).max(600).optional().describe("Seconds between posts. Default 5"),
        delayMax: z.number().min(1).max(600).optional().describe("Default 6"),
        dryRun: z.boolean().optional().describe("Default true"),
      },
      annotations: WRITE,
    },
    async ({ dryRun = true, ...args }) => {
      if (!dryRun) return post(postReplies as Handler, args);

      const items = await Promise.all(
        args.items.map(async (item) => {
          const d = await getDiscussion(args.credentialId, item.courseId, item.discussionId);
          return { ...item, found: !!d, title: d?.title, startedBy: d?.startedBy, alreadyReplied: d?.iReplied };
        }),
      );
      return json({ dryRun: true, items });
    },
  );

  longTool(
    "grade_tugas",
    {
      description:
        "Write grades (0-100) and feedback for tugas submissions to UT. Student-visible; overwrites existing grades." + DRY_RUN_NOTE,
      inputSchema: {
        credentialId,
        courseId: courseId.describe("Course id; used to look up students for the dry-run preview"),
        assignId,
        grades: z
          .array(
            z.object({
              userId: id,
              score: z.number().min(0).max(100),
              feedback: z.string(),
            }),
          )
          .min(1),
        dryRun: z.boolean().optional().describe("Default true"),
      },
      annotations: WRITE,
    },
    async ({ dryRun = true, courseId, ...args }) => {
      if (!dryRun) return post(gradeTugas as Handler, args);

      const subs = await listTugasSubmissions(args.credentialId, courseId, args.assignId);
      const byId = new Map(subs.map((s) => [s.userId, s]));
      return json({
        dryRun: true,
        grades: args.grades.map((g) => {
          const s = byId.get(g.userId);
          return { ...g, found: !!s, name: s?.name, currentGrade: s?.grade ?? null };
        }),
      });
    },
  );

  return server;
}
