# UT-Assistant Agent API

This app exposes its UT LMS automation as plain JSON HTTP endpoints, so an
external agent (Claude, n8n, a script, curl) can drive it remotely: log in,
pull discussions/assignments, compile AI answers, and post them back.

## Connecting

1. Run the app locally: `npm run dev` (port 3000).
2. Expose it with a tunnel: `npm run tunnel` (or `cloudflared tunnel --url http://localhost:3000`).
3. Give the agent the printed `https://<id>.trycloudflare.com` base URL **and the key**.

### Auth

Every request through the tunnel must carry the key from `AGENT_API_KEY` (in `.env`):

```
Authorization: Bearer <AGENT_API_KEY>
```

(`x-api-key: <AGENT_API_KEY>` also works.)

Requests that arrive **through the Cloudflare tunnel** (identified by the
`cf-connecting-ip` header Cloudflare injects) must carry the key. Requests made
**directly on the machine** — the local web UI on `localhost` — are exempt and
need no key. So nothing in the existing UI changes. See `proxy.ts`.

On a VM or behind a non-Cloudflare proxy, set `AGENT_REQUIRE_KEY=always` to
require the key on every `/api/*` request.

> ⚠️ While the tunnel is up, anyone with the URL **and** key can act as you on
> UT. Keep the key secret; stop the tunnel when you're done.

### Conventions

- All action endpoints are **`POST`** with a JSON body; responses are JSON.
- `Content-Type: application/json` on every POST.
- IDs (`credentialId`, `courseId`, `forumId`, `discId`, `assignId`, `skillId`)
  are discovered via the read endpoints below — start there.
- One credential = one shared browser. Calls on the **same `credentialId`** are
  serialized server-side (they queue); different credentials run in parallel.
  An agent can fire many calls; same-credential ones just won't overlap.
- Long actions: scrapes/posts can take up to ~300s. Use generous client timeouts.

## Read endpoints (discover IDs / fetch stored data)

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/credentials` | credentials (`id`, `label`, `username`) |
| `GET` | `/api/skills` | AI skills (prompt templates) — `id`, `name` |
| `GET` | `/api/discussions?credentialId=&courseId=` | stored discussions + posts |
| `GET` | `/api/session-diskusi?credentialId=&courseId=&forumId=` | stored session-forum threads |
| `GET` | `/api/sessions?credentialId=&courseId=` | course sessions (contain tugas activities) |
| `GET` | `/api/gradebook?credentialId=&courseId=` | latest gradebook snapshot |
| `GET` | `/api/tugas/{assignId}?credentialId=&courseId=` | stored submissions for an assignment |
| `GET` | `/api/activity-log` | recent server activity log lines |

## Action endpoints (drive the browser / AI)

### Setup
| Path | Body | Effect |
|---|---|---|
| `POST /api/actions/login` | `{credentialId}` | log into UT, persist session |
| `POST /api/actions/courses` | `{credentialId}` | scrape + store course list |
| `POST /api/actions/sessions` | `{credentialId, courseId}` | scrape course sessions (+ tugas list) |

### Discussions (diskusi)
| Path | Body | Effect |
|---|---|---|
| `POST /api/actions/intro-forum` | `{credentialId, courseId}` | locate the Forum Perkenalan URL |
| `POST /api/actions/discussions` | `{credentialId, courseId}` | scrape intro-forum discussions + posts |
| `POST /api/actions/session-diskusi` | `{credentialId, courseId, forumId}` | scrape a session forum's threads |
| `POST /api/actions/course-diskusi` | `{credentialId, courseId}` | scrape ALL session diskusi forums in a course (needs collected sessions; continues past per-forum failures) |
| `POST /api/actions/generate-diskusi-replies` | `{credentialId, courseId, forumId, discId, skillId, maxStudents?, postIds?}` | **AI: score + draft a reply per student** |
| `POST /api/actions/generate-replies` | `{credentialId, skillId?}` | AI: draft intro-forum replies |
| `POST /api/actions/post-diskusi-replies` | `{credentialId, courseId, forumId, discId, discussionUrl, items:[{postId, reply, score?}], delayMin?, delayMax?}` | **post replies back to UT** |
| `POST /api/actions/post-replies` | `{credentialId, items:[{discussionId, courseId, discussionUrl, reply}], delayMin?, delayMax?}` | post intro-forum replies back |

### Assignments (tugas)
| Path | Body | Effect |
|---|---|---|
| `POST /api/actions/tugas` | `{credentialId, courseId, assignId, downloadFiles?, collectScope?}` | scrape submissions (+ download files) |
| `POST /api/actions/evaluate-tugas` | `{credentialId, courseId, assignId, skillId, model, userIds?}` | **AI: evaluate submissions** |
| `POST /api/actions/grade-tugas` | `{credentialId, assignId, grades:[{userId, score, feedback}]}` | **write grades + feedback back to UT** |
| `POST /api/actions/gradebook` | `{credentialId, courseId}` | scrape + store gradebook snapshot |

`collectScope`: `"all"` (default) or `"requiresGrading"`. `downloadFiles` defaults `true`.

## Worked flow A — grade a discussion end-to-end

```bash
BASE=https://<id>.trycloudflare.com
KEY=<AGENT_API_KEY>
H=(-H "Authorization: Bearer $KEY" -H "Content-Type: application/json")

# 1. pick a credential + course
curl "${H[@]}" $BASE/api/credentials

# 2. log in
curl "${H[@]}" -d '{"credentialId":"CRED"}' $BASE/api/actions/login

# 3. pull the session forum's threads
curl "${H[@]}" -d '{"credentialId":"CRED","courseId":"COURSE","forumId":"FORUM"}' \
  $BASE/api/actions/session-diskusi

# 4. AI scores + drafts a reply per student
curl "${H[@]}" -d '{"credentialId":"CRED","courseId":"COURSE","forumId":"FORUM","discId":"DISC","skillId":"SKILL"}' \
  $BASE/api/actions/generate-diskusi-replies
# -> { results: [ { postId, author, score, replies:[...] } ] }

# 5. post the (optionally agent-edited) replies back
curl "${H[@]}" -d '{"credentialId":"CRED","courseId":"COURSE","forumId":"FORUM","discId":"DISC",
  "discussionUrl":"https://elearning.ut.ac.id/mod/forum/discuss.php?d=DISC",
  "items":[{"postId":"P1","reply":"...","score":85}]}' \
  $BASE/api/actions/post-diskusi-replies
```

The `items` in step 5 is where an agent injects answers it generated/edited
itself — it doesn't have to use step 4's drafts verbatim.

## Worked flow B — grade an assignment

```
login → /api/actions/sessions  (find assignId)
      → /api/actions/tugas       (pull submissions + files)
      → /api/actions/evaluate-tugas  (AI scores + feedback)
      → /api/actions/grade-tugas (write grades:[{userId, score, feedback}] back to UT)
```

## Notes for going to a VM later

- Set `PLAYWRIGHT_HEADED=0` (headless).
- Set `AGENT_REQUIRE_KEY=always` so the key is required on every request (the
  `cf-connecting-ip` tunnel check in `proxy.ts` only applies to Cloudflare).

## MCP

The same actions are exposed as MCP tools at `/api/mcp` (Streamable HTTP,
stateless; `lib/mcp/server.ts`). Tools call the route handlers above
in-process, so behaviour, validation and per-credential queuing are identical.
Auth is the same bearer key via `proxy.ts`.

Agent on the same machine (Claude Code, incl. remote-control sessions) — no
key, no tunnel; localhost requests are exempt in `proxy.ts`:

```bash
claude mcp add --transport http ut-assistant http://localhost:3000/api/mcp
```

Only a remote agent going through the tunnel needs the key:

```bash
claude mcp add --transport http ut-assistant https://<id>.trycloudflare.com/api/mcp \
  --header "Authorization: Bearer <AGENT_API_KEY>"
```

`generate_diskusi_replies` uses the credential's configured `diskusiSkillId`
unless `skillId` is passed.

Tools (31):

- **Read:** `list_credentials`, `list_skills`, `list_courses`, `get_sessions`,
  `get_discussions`, `get_session_diskusi`, `get_diskusi_posts` (posts as
  markdown + question/pedoman/drafts; filter with `unrepliedOnly`, `postIds`,
  `includeContent: false`), `get_gradebook` (compact score monitor,
  `missingOnly`), `get_tugas_submissions`, `get_activity_log`
- **Collect (browser):** `login`, `reset_session`, `collect_courses`,
  `collect_sessions`, `collect_intro_forum`, `collect_discussions`,
  `collect_session_diskusi`, `collect_course_diskusi`, `collect_rubrik_diskusi`,
  `collect_tugas`, `collect_gradebook`, `collect_material`
- **AI (Gemini, nothing posted; needs `GEMINI_ENABLED=1`):**
  `generate_diskusi_replies`, `generate_replies`, `generate_reply`,
  `evaluate_tugas` (overwrites stored AI evaluations; `model` defaults to
  `GEMINI_MODEL`)
- **Write (student-visible):** `post_diskusi_replies`, `post_replies`,
  `grade_tugas`. **`dryRun` defaults to `true`** and returns a preview (student
  name, current grade, already-replied, unknown ids); pass `dryRun: false` to
  actually post. `grade_tugas` also takes `courseId` (for the preview).
- **Jobs:** every collect/AI/write tool accepts `background: true` and returns a
  `jobId` at once; poll `get_job` (or `list_jobs`). Use it for anything that
  may exceed the client's tool timeout. Jobs live in memory and are lost on
  server restart; the underlying data is already persisted.
