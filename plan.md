# UT Assistant — Implementation Plan

AI assistant / automation tool for lecturers at Universitas Terbuka. Full-stack Next.js app that runs locally now, portable to a VM later.

## Goals

- Web app UI to manage saved UT LMS credentials
- Per-credential "actions" page listing automated tasks
- Actions run server-side via Playwright against `elearning.ut.ac.id`
- Starting actions:
  1. **Open UT & login** — launch browser, navigate to UT login, submit credentials
  2. **Collect course list** — navigate to `/my/courses.php`, scrape course name + URL from each `a.aalink.coursename` (name inside `span.multiline`)

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| UI | Tailwind CSS + shadcn/ui |
| Automation | Playwright (Node) |
| AI | Gemini via `@google/genai` |
| Storage | Firebase Firestore (Admin SDK, server-side) |
| Auth for creds | AES-256-GCM encryption at rest, key from env |
| Runtime | `next dev` locally; `next start` behind a reverse proxy on VM |

## Directory structure

```
my-assistant/
  app/
    layout.tsx
    page.tsx                         # credentials list (home)
    credentials/
      new/page.tsx                   # add credential form
      [id]/page.tsx                  # actions page
    api/
      credentials/
        route.ts                     # GET list, POST create
        [id]/route.ts                # GET one, PUT, DELETE
      actions/
        login/route.ts               # POST { credentialId }
        courses/route.ts             # POST { credentialId } -> course[]
      chat/route.ts                  # POST { message, context }
  components/
    ui/                              # shadcn components
    credential-card.tsx
    action-button.tsx
  lib/
    firebase-admin.ts                # lazy Firestore singleton
    gemini.ts
    crypto.ts                        # encrypt/decrypt password
    playwright/
      browser.ts                     # shared browser launcher
      ut-login.ts                    # login flow
      ut-courses.ts                  # course scraper
  types/
    index.ts
  .env.example
  .env.local                         # gitignored
  next.config.ts
  tailwind.config.ts
  tsconfig.json
  package.json
  plan.md
  CLAUDE.md
  firebase.json
  serviceAccountKey.json             # gitignored
```

## Data model (Firestore)

**`credentials` collection**
```ts
{
  id: string;            // auto
  label: string;         // user-friendly name e.g. "Akun Dosen Utama"
  username: string;
  passwordEnc: string;   // AES-256-GCM, base64
  passwordIv: string;    // base64
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**`courses` subcollection** (under a credential) — cached scrape results
```ts
{
  courseId: string;      // from URL ?id=
  name: string;
  url: string;
  collectedAt: Timestamp;
}
```

## API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/credentials` | list |
| POST | `/api/credentials` | create (encrypts password) |
| GET | `/api/credentials/[id]` | detail (no password returned) |
| PUT | `/api/credentials/[id]` | update |
| DELETE | `/api/credentials/[id]` | remove |
| POST | `/api/actions/login` | headed Playwright login flow |
| POST | `/api/actions/courses` | scrape `/my/courses.php` → save to subcollection |
| POST | `/api/chat` | Gemini passthrough |

## Playwright flows

### `ut-login.ts`
1. Launch chromium (headed locally, headless on VM via env flag)
2. Go to `https://elearning.ut.ac.id/login/index.php`
3. Fill `#username`, `#password`, click `#loginbtn`
4. Wait for dashboard redirect
5. Return `BrowserContext` (reused by subsequent actions in same session) or persist storageState for reuse

### `ut-courses.ts`
1. Assume logged-in context
2. `page.goto('https://elearning.ut.ac.id/my/courses.php')`
3. `page.$$eval('a.aalink.coursename', els => els.map(a => ({ url: a.href, name: a.querySelector('span.multiline')?.textContent?.trim() })))`
4. Derive `courseId` from URL `?id=` param
5. Upsert into Firestore `credentials/{id}/courses`

## UI pages

**`/` (Credentials list)**
- Grid of credential cards (label, masked username)
- "Add credential" button → `/credentials/new`

**`/credentials/new`**
- Form: label, username, password
- On submit → POST, redirect to detail

**`/credentials/[id]` (Actions page)**
- Header: credential label + edit/delete
- Action list (shadcn `Card` each):
  - "Open UT & login" → POST `/api/actions/login`, show status + link
  - "Collect course list" → POST `/api/actions/courses`, render returned table
- Course table below (cached results, collapsible)

## Security

- `.env.local` holds `ENCRYPTION_KEY` (32-byte base64), `GEMINI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`
- Passwords encrypted with AES-256-GCM before Firestore write
- Never return `passwordEnc` / `passwordIv` to the client
- Playwright runs server-side only; no creds leave the server
- Local-only: bind to `127.0.0.1` on VM, expose via SSH tunnel or tailscale, not public

## Deployment to VM (future)

- `npm run build && npm run start`
- systemd unit `ut-assistant.service`
- Playwright needs `npx playwright install --with-deps chromium` on VM
- Reverse proxy via Caddy/nginx with basic auth
- Firestore credentials via `GOOGLE_APPLICATION_CREDENTIALS` pointing to mounted key file

## Implementation steps

1. `npx create-next-app@latest` in repo root (TS, Tailwind, App Router, src dir: no)
2. Install: `firebase-admin`, `@google/genai`, `playwright`, `shadcn` CLI
3. `npx playwright install chromium`
4. `npx shadcn@latest init` then add `button card input label form table dialog sonner`
5. `lib/firebase-admin.ts`, `lib/crypto.ts`, `lib/gemini.ts`
6. Credentials CRUD API + UI
7. Playwright login flow + login action endpoint
8. Course scraper + action endpoint + table UI
9. Chat endpoint (port of old Gemini behavior)
10. `.gitignore`, `.env.example`, README updates in `CLAUDE.md`

## Out of scope (for now)

- Multi-user auth on the web app itself (local-only assumption)
- Reply/grading automation (next milestone after login + course collection works)
- Scheduling / background jobs
