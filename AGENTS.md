# AGENTS.md

## Project Summary

This repository is a Cloudflare Workers attendance web app for catechism/church sessions.

- Backend entry: `backend/src/index.js`
- Frontend assets: `frontend/`
- Database: Cloudflare D1 via binding `DB`
- External integration: Google Apps Script endpoint in `wrangler.toml` and local reference logic in `appscript.txt`
- Deployment config: `wrangler.toml`

The Worker serves both API routes and static frontend assets. It also has scheduled cron jobs that batch-sync attendance records to Google Sheets.

## Top-Level Structure

- `backend/`
  - `src/index.js`: Worker entrypoint, request dispatch, scheduled hook
  - `src/routes/`: HTTP/page/API route handlers
  - `src/services/`: D1/session/telegram/student helpers
  - `src/config/`: session time definitions
  - `scripts/import-students-csv.mjs`: import student CSV into D1
  - `package.json`: local backend script definitions
- `frontend/`
  - `index.html`: main attendance page
  - `login.html`: Google login page
  - `adminpanel.html`: separate admin login page
  - `studentspanel.html`: student management page
  - `js/`: frontend modules
  - `css/`: frontend styles
  - `assets/`: static images
- `migrations/`
  - `0001_create_allowed_users.sql`
  - `0002_create_students.sql`
  - `0003_create_attendance_records.sql`
- `appscript.txt`
  - reference Google Apps Script used by Sheets sync/check-in
- `wrangler.toml`
  - Worker config, assets binding, vars, D1 binding, cron triggers

## Backend Architecture

### Entrypoint

`backend/src/index.js` handles:

- auth routes under `/auth/*`
- page routes via `backend/src/routes/pages.js`
- admin API routes under `/api/admin/*`
- student admin API routes under `/api/students-admin*`
- normal authenticated API routes:
  - `/api/me`
  - `/api/checkin`
  - `/api/students`
- scheduled cron execution through `runBatchSync(env)`

### Route Files

- `backend/src/routes/auth.js`
  - Google OAuth login/callback
  - session cookie creation
- `backend/src/routes/pages.js`
  - serves `adminpanel.html`
  - serves `studentspanel.html`
- `backend/src/routes/admin.js`
  - custom admin login with `ADMIN_USERNAME` / `ADMIN_PASSWORD`
  - allowed user CRUD
  - batch sync trigger
  - exports `runBatchSync(env)` for scheduled sync
- `backend/src/routes/students-admin.js`
  - list/filter classes and students
  - create/update/delete students in D1
  - accepts either admin bearer token or normal session role
- `backend/src/routes/students.js`
  - public-in-app student lookup/search API for attendance UI
- `backend/src/routes/checkin.js`
  - validates active session window
  - forwards check-in payload to Apps Script
- `backend/src/routes/me.js`
  - returns current authenticated user and role

### Service Files

- `backend/src/services/session.js`
  - cookie session signing/verifying
- `backend/src/services/students.js`
  - student CSV parsing
  - D1 student CRUD/search/lookup/class listing
- `backend/src/services/users.js`
  - allowed user access helpers
- `backend/src/services/telegram.js`
  - Telegram notifications for failures/events
- `backend/src/utils/log.js`
  - structured logging

## Frontend Architecture

### Main Attendance App

Files:

- `frontend/index.html`
- `frontend/js/main.js`
- `frontend/js/state.js`
- `frontend/js/config.js`
- `frontend/js/services/attendance.js`
- `frontend/js/services/scanner.js`
- `frontend/js/services/sessionTime.js`
- `frontend/js/services/studentDB.js`
- `frontend/js/api/checkin.js`
- `frontend/js/api/students.js`
- `frontend/js/utils/suggestions.js`
- `frontend/js/utils/notify.js`

Responsibilities:

- login-protected attendance UI
- QR scanning
- manual student lookup
- attendance list rendering
- off-hours/session gating
- check-in POST to backend

### Admin Pages

- `frontend/adminpanel.html`
  - separate admin login screen
  - developer-facing allowed user management
- `frontend/js/admin.js`
  - bearer token flow for `/api/admin/*`
  - token is currently in-memory only, not persisted across reload
- `frontend/studentspanel.html`
  - student CRUD sheet-style page
- `frontend/js/studentspanel.js`
  - role-aware UI bootstrap
  - shows only access-denied panel for unauthorized users
  - class-filtered student CRUD

## Data Flow

### Attendance Flow

1. User logs in through Google OAuth.
2. Frontend loads `/api/me` and session data.
3. Student is found by QR/manual lookup.
4. Frontend posts to `/api/checkin`.
5. Backend validates the time window.
6. Backend forwards payload to Apps Script.
7. Apps Script writes the row to Google Sheets.

Notes:

- `scannedBy` is currently set by frontend from `state.currentUser?.name`.
- The actual timestamp written to Sheet is generated on the Apps Script side for normal check-in.
- Scheduled batch sync uses D1 `attendance_records` and Apps Script batch mode.

### Student Data Flow

- Source of truth for students is D1 `students`.
- CSV import script writes students into D1.
- `/api/students-admin` performs student CRUD on D1.
- `/api/students` provides lookup/search for attendance UI.

Important: current frontend code is not fully aligned with the “D1-only, no local student cache” intent.

`frontend/js/services/studentDB.js` still:

- fetches `/api/students?type=getAll)`
- caches all students in `localStorage` under `allStudentsCache`
- serves scanner/manual lookup from that local cache

If changing lookup behavior, inspect this file first. Do not assume the main page is already fully D1-live on every keystroke.

## Database

### D1 Tables

Based on migrations and code:

- `allowed_users`
  - Google-authorized users and roles
- `students`
  - imported student directory used for lookup and CRUD
- `attendance_records`
  - pending/synced attendance sync records used by batch sync

### Migrations

- `migrations/0001_create_allowed_users.sql`
- `migrations/0002_create_students.sql`
- `migrations/0003_create_attendance_records.sql`

When adding schema changes, create a new migration instead of editing old migrations.

## Environment and Config

### Wrangler

Defined in `wrangler.toml`:

- Worker name: `diemdanhqr`
- main: `backend/src/index.js`
- assets directory: `frontend`
- D1 binding: `DB`
- cron triggers enabled

### Expected Secrets / Vars

From code and config, the Worker expects values like:

- `APP_URL`
- `REDIRECT_URI`
- `APPS_SCRIPT_URL`
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- Telegram credentials if notifications are enabled

Local dev variables appear in `.dev.vars`.

## Commands

### Deploy

User usually runs deploy manually:

```powershell
wrangler deploy
```

### Import Students CSV

```powershell
node .\backend\scripts\import-students-csv.mjs "D:\INDEX.csv" --remote
```

### Syntax Checks

Useful quick checks:

```powershell
node --check backend\src\index.js
node --check backend\src\routes\admin.js
node --check backend\src\routes\students-admin.js
node --check frontend\js\main.js
node --check frontend\js\admin.js
node --check frontend\js\studentspanel.js
```

## Current Authorization Model

This repo currently has two distinct auth mechanisms:

### 1. Normal app auth

- Google OAuth via `/auth/login`
- session cookie
- role stored in D1 `allowed_users`

Used for:

- main attendance app
- `/api/me`
- `/api/checkin`
- `/api/students`
- `/api/students-admin` when using normal session role

### 2. Separate admin login

- `/api/admin/login`
- username/password from env
- signed bearer token

Used for:

- `/api/admin/*`
- developer-style user management page

Do not assume `/admin` and `/students-admin` share the same auth flow.

## Known Codebase Quirks

- Several files still display mojibake in some terminals/PowerShell outputs. Verify actual browser rendering before mass “encoding fixes”.
- `frontend/js/services/studentDB.js` still uses `localStorage` and a full-student cache.
- `backend/src/routes/pages.js` serves `/admin` and `/students-admin` pages; hiding a route in UI is not the same as securing it.
- `appscript.txt` is not executable code in deployment, but it documents the expected Apps Script behavior and must stay consistent with backend payloads.
- The user prefers to run terminal/deploy commands themselves. Favor code changes over taking over their terminal workflow.

## Editing Guidelines For Future Agents

- Treat `backend/src/index.js` as a thin router. Prefer adding/changing route files under `backend/src/routes/` instead of growing the entrypoint.
- Keep student business logic in `backend/src/services/students.js`.
- Keep page-specific UI logic in `frontend/js/*.js`, not inline HTML.
- Use `apply_patch` for manual file edits.
- When changing attendance behavior, inspect both:
  - Worker backend flow
  - `appscript.txt`
- When changing auth/roles, inspect all of:
  - `backend/src/routes/auth.js`
  - `backend/src/routes/admin.js`
  - `backend/src/routes/students-admin.js`
  - `backend/src/routes/pages.js`
  - `frontend/js/admin.js`
  - `frontend/js/studentspanel.js`
- When changing student lookup, inspect both:
  - `backend/src/routes/students.js`
  - `frontend/js/services/studentDB.js`

## Preferred Review Checklist Before Deploy

- route still resolves through `backend/src/index.js`
- page route auth/display behavior is intentional
- D1 queries still match current schema
- frontend JS passes `node --check`
- no new inline styles or missing accessible names in admin/student HTML
- any Apps Script payload shape changes are mirrored in `appscript.txt`
