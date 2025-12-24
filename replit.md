# Multi-Vessel Onboard

## Overview
A vessel takeover task management system for iShip/OneSea. It allows tracking tasks, endpoints, and team assignments for vessel onboarding processes.

## Project Architecture
- **Frontend**: React + Vite (port 5000)
- **Backend**: Express + Socket.IO (port 3001)
- **Database**: PostgreSQL with Drizzle ORM (persistent data storage)

## Directory Structure
```
├── client/           # React frontend
│   ├── src/
│   │   ├── App.jsx   # Main application component
│   │   └── App.css   # Styles
│   ├── public/       # Static assets
│   └── vite.config.js
├── server/           # Express backend
│   ├── server.js     # Main server with API routes
│   ├── db.js         # Database connection
│   ├── schema.js     # Drizzle ORM schema definitions
│   ├── storage.js    # Database storage layer
│   ├── whatsappService.js  # WhatsApp integration
│   └── uploads/      # Uploaded files storage
├── drizzle.config.js # Drizzle configuration
└── package.json      # Root package with dev scripts
```

## Database Schema
Tables managed by Drizzle ORM:
- **vessels**: id, name, imo, hidden, createdAt
- **tasks**: id, vesselId, title, status, expectedTime, comments (JSONB), files (JSONB), history, timers
- **taskComments**: id, taskId, text, authorId, authorName, role, parentId, createdAt
- **taskAttachments**: id, taskId, filename, path, createdAt
- **endpoints**: id, vesselId, name, ip, assignedTo, status, history, timers
- **logs**: id, vesselId, action, ip, userAgent, createdAt

## Running the App
The app runs with two workflows:
1. **Backend Server**: `cd server && node server.js` (port 3001)
2. **Frontend**: `cd client && npm run dev` (port 5000)

## Authentication
Users log in with a password only. Roles:
- **Admin**: Full access to all features, can hide/show vessels
- **Onboard Eng**: Can manage tasks and endpoints
- **Remote Team**: Can add tasks and comments
- **Client**: View-only with commenting ability

## Vessel Visibility
- Admins can hide vessels from non-admin users
- Hidden vessels show "(Hidden)" badge in the vessel list
- Use the eye icon button to toggle visibility

## API Configuration
The frontend uses Vite's proxy to route API requests to the backend:
- `/api/*` → localhost:3001
- `/uploads/*` → localhost:3001
- `/socket.io/*` → localhost:3001 (WebSocket)

## WhatsApp Integration
The system supports WhatsApp notifications via QR code authentication:

### Setup (Admin only)
1. Go to the "WhatsApp" tab in the admin interface
2. Click "Initialize WhatsApp" to start the connection
3. Scan the QR code with WhatsApp (use a secondary number)
4. Once connected, click "Load Groups" and select the notification group

### Notifications
WhatsApp messages are sent when:
- A task is started (includes expected time)
- A task is paused
- A task is completed
- A comment is added to a task

### Auto-Reconnect
- WhatsApp automatically reconnects every 4-6 hours to avoid being marked as suspicious
- Session data stored in `.wwebjs_auth/` directory

### Technical Details
- Uses whatsapp-web.js library with Puppeteer
- Admin-only API routes: `/api/whatsapp/*`
- Service file: `server/whatsappService.js`

## Production Deployment
- Uses VM deployment (not autoscale) to ensure database access
- Server runs on port 5000 in production (PORT env var)
- Health check endpoints: `/health` and `/api/health`
- Database URL sourced from `/tmp/replitdb` (production) or `DATABASE_URL` env var

## Recent Changes
- 2025-12-24: Fixed production deployment issues
  - Added health check endpoints for deployment verification
  - Improved database connection handling (graceful fallback)
  - Added dynamic Chromium path detection for WhatsApp
  - Fixed missing fs import in server.js
- 2025-12-24: Migrated to PostgreSQL database
  - Added Drizzle ORM with proper schema
  - Created storage.js abstraction layer
  - Data now persists between restarts
- 2025-12-24: Added vessel hide/show feature
  - Admins can hide vessels from non-admin users
  - Eye icon button in vessel card for toggling
- 2025-12-24: WhatsApp improvements
  - Simplified notification messages
  - Added auto-reconnect scheduler (4-6 hours)
- 2025-12-23: Added WhatsApp integration with QR code authentication
- 2025-12-23: Configured for Replit environment
