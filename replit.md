# Multi-Vessel Onboard

## Overview
A vessel takeover task management system for iShip/OneSea. It allows tracking tasks, endpoints, and team assignments for vessel onboarding processes.

## Project Architecture
- **Frontend**: React + Vite (port 5000)
- **Backend**: Express + Socket.IO (port 3001)
- **Database**: In-memory (no persistent database)

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
│   └── uploads/      # Uploaded files storage
└── package.json      # Root package with dev scripts
```

## Running the App
The app runs with two workflows:
1. **Backend Server**: `cd server && node server.js` (port 3001)
2. **Frontend**: `cd client && npm run dev` (port 5000)

## Authentication
Users log in with a password only. Roles:
- **Admin**: Full access to all features
- **Onboard Eng**: Can manage tasks and endpoints
- **Remote Team**: Can add tasks and comments
- **Client**: View-only with commenting ability

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
- A task is started
- A task is paused
- A task is completed
- A comment is added to a task

### Technical Details
- Uses whatsapp-web.js library with Puppeteer
- Session data stored in `.wwebjs_auth/` directory
- Admin-only API routes: `/api/whatsapp/*`
- Service file: `server/whatsappService.js`

## Recent Changes
- 2025-12-23: Added WhatsApp integration with QR code authentication
  - Created WhatsApp service module with notification templates
  - Added admin-only WhatsApp settings tab
  - Integrated notifications into task actions
- 2025-12-23: Configured for Replit environment
  - Updated Vite config with proxy and allowed hosts
  - Changed server port to 3001
  - Updated frontend to use relative URLs through proxy
