Multi-Vessel Onboard Live - Full Rewrite
========================================

This project contains:
- Node.js + Express + Socket.io backend (server/)
- React + Vite frontend (client/)
- PostgreSQL (Drizzle ORM) for persistence
- Optional WhatsApp alerts (needs Chrome/Chromium)

Main features:
- Multi-vessel dashboard
- Per-vessel task checklist with groups
- One-active-task timer logic
- 1-hour deadline per task with under-time / delayed indication
- Drag-and-drop task reordering (engineer only)
- Comments per task
- Screenshot upload per task
- Activity log / audit trail per vessel
- Bottom sticky summary bar
- Simple mini timeline / progress strip on each task
- Engineer vs Client views
- PDF export of the task view

Quick Start
-----------

Prereqs: Node.js (LTS), PostgreSQL, Chrome/Chromium if you want WhatsApp notifications.

1) Install deps
   npm install
   cd server && npm install
   cd ../client && npm install

2) Create DB and schema (PostgreSQL)
   export DATABASE_URL="postgres://USER:PASS@HOST:5432/onboard"
   npm run db:push

3) Run in dev (Vite + API together)
   export DATABASE_URL="postgres://USER:PASS@HOST:5432/onboard"
   npm run dev
   Open http://localhost:5000

Production / Hosting
--------------------
- Build client: npm run build  (runs db:push then builds client to client/dist)
- Serve: DATABASE_URL="..." PORT=3001 node server/server.js
  The server will serve the built frontend from client/dist.
- Persist uploads: keep server/uploads on a volume; deletes are manual.
- Env to know: DATABASE_URL (required), PORT (optional, default 3001).

Architecture (fast overview)
----------------------------
- server/server.js: Express REST + Socket.io; JWT auth (password-only login mapped to in-code users); uploads via Multer to server/uploads; WhatsApp integration routes.
- server/storage.js + schema.js: Drizzle models for vessels, tasks, endpoints, comments, attachments, logs.
- client/src/App.jsx: Single-page React UI with role-based views, drag/drop tasks, endpoints table, PDF export, WhatsApp admin tab.
- drizzle.config.js: Drizzle CLI config (uses DATABASE_URL).

WhatsApp (optional)
-------------------
- Needs Chrome/Chromium on the host.
- Admin-only routes: /api/whatsapp/init (start), /api/whatsapp/stop (manual off), /api/whatsapp/status, /api/whatsapp/qr, /api/whatsapp/groups, /api/whatsapp/set-group.
- Session stored in server/.wwebjs_auth; survives restarts if the folder is persisted.

Auth notes
----------
- Login is password-only; the valid passwords and roles are hardcoded in server/server.js.
- Roles: Admin, Onboard Eng, Remote Team, Client. Hidden vessels are visible only to Admin.
