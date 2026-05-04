# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project overview

AI assistant / automation tool for lecturers at Universitas Terbuka.
Full-stack **Next.js 16** (App Router, TypeScript, Tailwind v4, shadcn/ui). Runs locally; deployable to a VM later. See `plan.md` for the implementation plan.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind v4 + shadcn/ui (Radix / Nova preset)
- Playwright (chromium) for UT LMS automation
- Firebase Admin (Firestore) for storage
- Gemini via `@google/genai`

## Layout

```
app/
  page.tsx                     # credentials list
  credentials/new/page.tsx     # create form
  credentials/[id]/            # actions page + client component
  api/
    credentials/route.ts       # list, create
    credentials/[id]/route.ts  # get, update, delete
    actions/login/route.ts     # Playwright UT login
    actions/courses/route.ts   # scrape /my/courses.php
lib/
  firebase-admin.ts            # lazy Firestore singleton
  crypto.ts                    # AES-256-GCM password encryption
  gemini.ts                    # Gemini client
  credentials.ts               # credentials service
  courses.ts                   # courses service (subcollection)
  playwright/
    browser.ts                 # launcher + per-credential storageState
    ut-login.ts                # login flow
    ut-courses.ts              # course scraper
types/index.ts
```

Per-credential browser sessions are persisted to `.playwright-sessions/{credentialId}.json` so login isn't needed on every action.

## Run

```bash
npm install
npx playwright install chromium
cp .env.example .env.local   # fill in values
npm run dev
```

Required env:
- `ENCRYPTION_KEY` — 32-byte base64 key (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
- `GEMINI_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS` — path to Firebase service account JSON (defaults to `./serviceAccountKey.json`)
- `PLAYWRIGHT_HEADED` — `1` (default, headed) or `0` (headless, for VM)

`serviceAccountKey.json` and `.env*` are gitignored.

## Firestore model

- `credentials/{id}` — `label`, `username`, `passwordCt`, `passwordIv`, `passwordTag`, `createdAt`, `updatedAt`
- `credentials/{id}/courses/{courseId}` — `name`, `url`, `collectedAt`

Passwords are AES-256-GCM encrypted before write; plaintext never leaves the server.

## UT LMS selectors (verified)

- Login page: `https://elearning.ut.ac.id/login/index.php` — `#username`, `#password`, `#loginbtn`
- Courses list: `https://elearning.ut.ac.id/my/courses.php` — `a.aalink.coursename`, name inside `span.multiline`, course id from `?id=` query param
