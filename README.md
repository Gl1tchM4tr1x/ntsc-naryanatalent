# NTS Student Portal

A snapshot student + admin portal for Narayana (NTSC) with a persistent Node.js
backend: strict weekly timetable generation, daily attendance rollups, live
server-time IST clock, real-time SSE sync, remote session management and an
audit log.

## What ships

- `localhost8081/` — static frontend (student dashboard + admin portal SPA).
- `server/` — Node backend (Express) that serves the frontend and the API.
- `server/data/portal-data.json` — the authoritative JSON store (student
  profile, timetables, attendance, results, sessions, audit log).
- `server/node_modules/` — vendored dependencies (Express, node-cron) so the
  ZIP runs offline with `node` only.
- `student-management-portal.zip` — the same `localhost8081/` + `server/`
  packaged as a ready-to-run archive.

## Quick start (local)

Requires Node.js >= 18. No build step.

```powershell
cd server
npm install          # not needed if running from the ZIP
npm start            # listens on http://localhost:8081
```

Open http://localhost:8081. Login with the student mobile
(`9530135914`, any password unless `LOGIN_PASSWORD` is set) or the admin
username/password (`devanshu` / default in `server/.env` — override in
production).

Run the test suite:

```powershell
cd server
node --test          # 66 tests, 0 failures
```

## Configuration

Configuration is read from the process environment, then from `server/.env`
(a minimal loader, no extra dependency). See `server/.env.example` for the full
list. Key variables:

| Variable            | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `PORT`              | Listen port (default `8081`).                                  |
| `HOST`              | Bind address (default `0.0.0.0`).                              |
| `NODE_ENV`          | `production` enforces the admin-token check.                   |
| `ADMIN_TOKEN`       | **Required in production.** Secret for the admin API.          |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin Portal sign-in credentials.                |
| `SESSION_SECRET`    | Salt for session tokens (set a strong value in production).    |
| `SESSION_TTL_HOURS` | Session lifetime in hours (default `24`).                      |
| `DATA_DIRECTORY`    | Directory for the JSON store (point at your persistent disk).  |
| `STORE_PATH`        | Full path to the store file.                                   |
| `TIMETABLE_CRON` / `ATTENDANCE_CRON` | Scheduler schedules (Asia/Kolkata).             |
| `DISABLE_SCHEDULER` | Set `1` to disable cron jobs.                                  |
| `LOGIN_PASSWORD`    | If set, student login requires this shared password too.       |

## The store and data safety

- All mutable state lives in `server/data/portal-data.json` (single file).
- On first boot the server seeds it from `localhost8081/api/portal-data.json` if
  the store file does not exist. Existing data is never overwritten by a rebuild.
- The scheduler is idempotent: on startup it runs a catch-up pass for any due
  timetable/attendance missed while the server was down, and manual admin edits
  to attendance are pinned so the scheduler never overwrites them.

## Admin API

Admin endpoints live under `/api/admin/*`. A request is authorized when the
`x-admin-token` header matches `ADMIN_TOKEN` — this wins over the admin session
cookie, so scripts can drive the API without a browser login.

Highlights: `GET /api/admin/timetable`, `GET/POST /api/admin/timetable/preview`,
`PUT/DELETE /api/admin/timetable/:date` (strict 3+1 rule enforced server-side),
`GET /api/admin/attendance`, `PUT /api/admin/attendance/record`,
`GET /api/admin/sessions`, `GET /api/admin/audit`, tests/results/exam-calendar
editors, and `POST /api/jobs/run-timetable` / `run-attendance`.

## Real-time sync

`GET /api/events?token=...&role=student|admin` is a Server-Sent Events stream
(3s retry, 25s heartbeat). Any store change bumps `dataVersion` and broadcasts
`{type:'update',version}`; remote logout broadcasts `{type:'logout',token}` so
revoked sessions are kicked out instantly.

## Deploying to Render

`render.yaml` is a Render blueprint:

1. Create a new service from this repo (Render picks up `render.yaml`).
2. When prompted, set `ADMIN_TOKEN` (and `ADMIN_USERNAME`/`ADMIN_PASSWORD`) —
   the service will not start in production without an admin token.
3. Render attaches the persistent disk at `/data`; set `DATA_DIRECTORY=/data`
   so the store survives restarts and deploys.

Manual equivalent: `npm start` with `NODE_ENV=production`, `ADMIN_TOKEN=...`,
`DATA_DIRECTORY=/data` on any host that provides persistent storage.

## Repackaging the ZIP

After making changes, rebuild the archive from the workspace root:

```powershell
Compress-Archive -Path localhost8081, server -DestinationPath student-management-portal.zip -Force
```
