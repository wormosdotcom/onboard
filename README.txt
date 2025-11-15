Multi-Vessel Onboard Live - Full Rewrite
========================================

This project contains:
- Node.js + Express + Socket.io backend (server/)
- React + Vite frontend (client/)

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

Backend:
  cd server
  npm install
  npm start

Frontend:
  cd client
  npm install
  npm run dev

Open the URL printed by Vite (usually http://localhost:5173).

Engineer actions use a simple API key: 'secret-engineer-key', sent in the X-API-KEY header.
Client view is read-only.