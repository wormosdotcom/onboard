import express from "express";
import http from "http";
import {Server} from "socket.io";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import {fileURLToPath} from "url";

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import {
    initWhatsApp,
    getStatus as getWhatsAppStatus,
    getQrCode,
    getGroups as getWhatsAppGroups,
    setGroupChatId,
    sendNotification,
    scheduleReconnect,
    stopWhatsApp
} from "./whatsappService.js";
import { storage as dbStorage } from "./storage.js";

const JWT_SECRET = "27389d24611f3c82ecbcf407162a22daa95f56e1";// move to env in prod

// Example in-memory users list
// password in plain text (for you to remember) is in comment; code uses only hashed version
const users = [{
    id: 1, name: "Sam", role: "Admin", // aag laga dege, can edit comment modify and delete
    passwordHash: bcrypt.hashSync("45546", 10)
},
//     {
//     id: 2, name: "Onboard Engineer 1", role: "Onboard Eng", passwordHash: bcrypt.hashSync("onboard001", 10)
// },
    {
    id: 3, name: "Abhinav", role: "Remote Team", // Task start, end and add + comment and photo upload
    passwordHash: bcrypt.hashSync("110203", 10)
}, {
    id: 10, name: "Jasleen", role: "Remote Team", // Task start, end and add + comment and photo upload
    passwordHash: bcrypt.hashSync("101010", 10)
}, {
    id: 11, name: "Nikita", role: "Remote Team", // Task start, end and add + comment and photo upload
    passwordHash: bcrypt.hashSync("101110", 10)
}, {
    id: 12, name: "Shashank", role: "Onboard Eng", // Task start, end and add + comment and photo upload
    passwordHash: bcrypt.hashSync("121011", 10)
}, {
    id: 13, name: "Anurag", role: "Remote Team", // Task start, end and add + comment and photo upload
    passwordHash: bcrypt.hashSync("131333", 10)
}, {
    id: 14, name: "Amanjot", role: "Onboard Eng", // Task start, end and add + comment and photo upload
    passwordHash: bcrypt.hashSync("141414", 10)
}, {
    id: 9, name: "Owner", role: "Client", passwordHash: bcrypt.hashSync("909090", 10) // View only, comment, photo upload
}, {
    id: 4, name: "Saqib", role: "Client", passwordHash: bcrypt.hashSync("404040", 10) // View only, comment, photo upload
}, {
    id: 5, name: "Pawan", role: "Client", passwordHash: bcrypt.hashSync("505050", 10) // View only, comment, photo upload
},  {
    id: 7, name: "Vessel Manager", role: "Client", passwordHash: bcrypt.hashSync("707070", 10) // View only, comment, photo upload
}, {
    id: 8, name: "Mark", role: "Client", passwordHash: bcrypt.hashSync("808080", 10) // View only, comment, photo upload
},{
        id: 15, name: "Dewansh Gangil", role: "Admin", // aag laga dege, can edit comment modify and delete
        passwordHash: bcrypt.hashSync("070313", 10)
    },{
        id: 16, name: "Kriti", role: "Admin", // aag laga dege, can edit comment modify and delete
        passwordHash: bcrypt.hashSync("365632", 10)
    },];

// Helper: given password, find user by comparing with all hashes
function findUserByPassword(password) {
    for (const u of users) {
        if (bcrypt.compareSync(password, u.passwordHash)) {
            return u;
        }
    }
    return null;
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", methods: ["GET", "POST", "DELETE"]
    }
});

app.use(cors());
app.use(express.json());

// static for uploaded files
const uploadsDir = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));

// Serve static frontend build in production
const clientDistPath = path.join(__dirname, "../client/dist");
console.log("Static files path:", clientDistPath);
console.log("Static files exist:", fs.existsSync(clientDistPath));
app.use(express.static(clientDistPath, { 
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store');
    }
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    }, filename: function (req, file, cb) {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({storage});

const ENGINEER_KEY = "secret-engineer-key";

function requireEngineer(req, res, next) {
    const key = req.header("X-API-KEY");
    if (key !== ENGINEER_KEY) {
        return res.status(403).json({error: "Forbidden"});
    }
    next();
}

// In-memory DB
let vessels = [];
let tasks = [];
let logs = [];
let endpoints = [];

async function addLog(vesselId, actionText, req = null) {
    try {
        await dbStorage.addLog(vesselId, actionText, req);
    } catch (err) {
        console.error('Error adding log:', err);
    }
}

const TASK_GROUPS = ["Network Setup", "Email & Communication", "Software Installations", "Server Setup", "Verification & Handover"];

const TEMPLATE_TASKS = [/* ------------------------------
       Section: Checking Old Systems
       ------------------------------ */
    {
        title: "Task 1: Verify server rack location and ventilation",
        group: "Checking Old Systems",
        deadline_seconds: 30 * 60,
        comments: [],
        attachments: [],
        taskNumber: 1,
        assignedTo: null //
    }, /* ------------------------------
       Section: Network Setup
       ------------------------------ */
    {
        title: "Task 2: Identify managed switches and trace cables",
        group: "Network Setup",
        deadline_seconds: 45 * 60,
        comments: [],
        attachments: [],
        taskNumber: 2,
        assignedTo: null //
    }, {
        title: "Task 3: Checking all WANs (SL1, SL2, VSAT etc) - Active or Not",
        group: "Network Setup",
        deadline_seconds: 60 * 60,
        comments: [],
        attachments: [],
        taskNumber: 3,
        assignedTo: null //
    }, {
        title: "Task 4: Connect EVO router with current onboard setup",
        group: "Network Setup",
        deadline_seconds: 60 * 60,
        comments: [],
        attachments: [],
        taskNumber: 4,
        assignedTo: null //
    }, {
        title: "Task 5: Crew WiFi - UNIFI",
        group: "Network Setup",
        deadline_seconds: 60 * 60,
        comments: [],
        attachments: [],
        taskNumber: 5,
        assignedTo: null //
    }, /* ------------------------------
       Section: Mail Server Setup
       ------------------------------ */
    {
        title: "Task 6: Setting up VM for Mail Server",
        group: "Mail Server Setup",
        deadline_seconds: 60 * 60,
        comments: [],
        attachments: [],
        taskNumber: 6,
        assignedTo: null //
    }, {
        title: "Task 7: Mail Server Setup",
        group: "Mail Server Setup",
        deadline_seconds: 60 * 60,
        comments: [],
        attachments: [],
        taskNumber: 7,
        assignedTo: null //
    }, {
        title: "Task 8: Verifying Test Email",
        group: "Mail Server Setup",
        deadline_seconds: 5 * 60,
        comments: [],
        attachments: [],
        taskNumber: 8,
        assignedTo: null //
    }, /* ------------------------------
       Section: Endpoints
       ------------------------------ */
    {
        title: "Task 9: Go to Endpoint Tab to Start Work",
        group: "Endpoints",
        deadline_seconds: 3 * 60 * 60,
        comments: [],
        attachments: [],
        taskNumber: 9,
        assignedTo: null //
    }, /* ------------------------------
       Section: Server Setup
       ------------------------------ */
    {
        title: "Task 10: Setting up VM for Software",
        group: "Server Setup",
        deadline_seconds: 60 * 60,
        comments: [],
        attachments: [],
        taskNumber: 10,
        assignedTo: null //
    }, {
        title: "Task 11: Installing softwares in VM",
        group: "Server Setup",
        deadline_seconds: 2 * 60 * 60,
        comments: [],
        attachments: [],
        taskNumber: 11,
        assignedTo: null //
    }, /* ------------------------------
       Section: Verification
       ------------------------------ */
    {
        title: "Task 12: Verify all applications, TV, mails, SOC agent, WiFi from Captain",
        group: "Verification",
        deadline_seconds: 30 * 60,
        comments: [],
        attachments: [],
        taskNumber: 12,
        assignedTo: null //
    }, {
        title: "Task 13: Sign Off – Get UAT & SR Signed from Master",
        group: "Verification",
        deadline_seconds: 15 * 60,
        comments: [],
        attachments: [],
        taskNumber: 13,
        assignedTo: null //
    }];

const TEMPLATE_ENDPOINT_FIELDS = {
    tv: "pending",
    adminAcc: "pending",
    accDisabled: "pending",
    windowsKey: "pending",
    softwareList: "pending",
    staticIP: "pending",
    noSleep: "pending",
    rdEnabled: "pending",
    crowdstrike: "pending",
    defender: "pending",
    soc: "pending",
    emailBackup: "pending",
    navis: "pending",
    emailSetup: "pending",
    mack: "pending",
    ns5: "pending",
    olp: "pending",
    compas: "pending",
    ibis: "pending",
    oss: "pending",
    proxyOff: "pending",
    rdpSoftwares: "pending",
    oneOcean: "pending",
    bvs: "pending"
};

function seedInitial() {

}

function createVesselWithTemplate(name, imo) {
    const id = Date.now() + "-" + Math.random().toString(36).slice(2);
    const vessel = {
        id,
        name,
        imo,
        status: "not_started",
        createdAt: new Date().toISOString(),
        endpointTimerStart: null,
        endpointTimerEnd: null,
        endpointElapsedSeconds: 0,
    };
    vessels.push(vessel);

    TEMPLATE_TASKS.forEach((tpl, idx) => {
        const tid = Date.now() + idx + Math.random();
        tasks.push({
            id: tid,
            vesselId: id,
            title: tpl.title,
            group: tpl.group,
            status: "pending",
            elapsed_seconds: 0,
            deadline_seconds: tpl.deadline_seconds,
            comments: [],
            attachments: [],
            taskNumber: tpl.taskNumber
        });
    });

    const ENDPOINT_NAMES = ["Bridge", "Master", "Shoff", "Shoff 2", "ECR", "ECR 2", "Cheng", "CDR", "CDR 2", "Loader", "Chart"];

    ENDPOINT_NAMES.forEach((label) => {
        endpoints.push({
            id: Date.now() + "-ep-" + Math.random().toString(36).slice(2),
            vesselId: vessel.id,
            label,
            fields: {...TEMPLATE_ENDPOINT_FIELDS},
            status: "not_started",        // not_started | in_progress | paused | done
            elapsedSeconds: 0,
            timerRunning: false,
            assignedTo: null,
        });
    });

    // Apply special endpoint rules
    endpoints.filter(e => e.vesselId === vessel.id && e.label === "Bridge").forEach(e => {
        e.fields.oneOcean = "pending";
        e.fields.bvs = "pending";
    });
    endpoints.filter(e => e.vesselId === vessel.id && e.label === "Master").forEach(e => {
        e.fields.bvs = "pending";
    });

    addLog(id, `Vessel Created Vessel "${name}" created with template tasks.`, req);
}

seedInitial();

// Timer: increment elapsed_seconds on in_progress tasks
let lastTick = Date.now();
// setInterval(() => {
//     const now = Date.now();
//     const diff = Math.floor((now - lastTick) / 1000);
//     if (diff <= 0) return;
//     lastTick = now;
//     let changed = false;
//     tasks.forEach((t) => {
//         if (t.status === "in_progress") {
//             t.elapsed_seconds = (t.elapsed_seconds || 0) + diff;
//             changed = true;
//         }
//     });
//     vessels.forEach(v => {
//         if (v.endpointTimerStart && !v.endpointTimerEnd) {
//             v.endpointElapsedSeconds = Math.floor((Date.now() - v.endpointTimerStart) / 1000);
//             changed = true;
//         }
//     });
//     if (changed) broadcastSnapshot();
// }, 1000);

setInterval(async () => {
    const now = Date.now();
    const diff = Math.floor((now - lastTick) / 1000);
    if (diff <= 0) return;
    lastTick = now;
    let changed = false;

    // Persist timers in DB for in-progress tasks
    try {
        const taskTimersUpdated = await dbStorage.incrementTaskTimers(diff);
        if (taskTimersUpdated) changed = true;
    } catch (err) {
        console.error('Error updating task timers:', err);
    }

    try {
        const endpointTimersUpdated = await dbStorage.incrementEndpointTimers(diff);
        if (endpointTimersUpdated) changed = true;
    } catch (err) {
        console.error('Error updating endpoint timers:', err);
    }

    if (changed) await broadcastSnapshot();
}, 1000);

async function buildSnapshot(userRole = 'Admin') {
    try {
        const vesselList = await dbStorage.getVessels(userRole);
        const taskList = await dbStorage.getAllTasks();
        const logList = await dbStorage.getAllLogs();
        const endpointList = await dbStorage.getAllEndpoints();
        return {
            vessels: vesselList,
            tasks: taskList,
            logs: logList,
            endpoints: endpointList,
            users
        };
    } catch (err) {
        console.error('Error building snapshot:', err);
        return { vessels: [], tasks: [], logs: [], endpoints: [], users };
    }
}

let cachedSnapshot = null;
let snapshotCacheTime = 0;
const SNAPSHOT_CACHE_TTL = 500;

async function getCachedSnapshot(userRole = 'Admin') {
    const now = Date.now();
    if (!cachedSnapshot || (now - snapshotCacheTime) > SNAPSHOT_CACHE_TTL) {
        cachedSnapshot = await buildSnapshot(userRole);
        snapshotCacheTime = now;
    }
    return cachedSnapshot;
}

function invalidateSnapshotCache() {
    cachedSnapshot = null;
}

async function broadcastSnapshot() {
    invalidateSnapshotCache();
    const snap = await buildSnapshot('Admin');
    io.emit("snapshot", snap);
}

io.on("connection", async (socket) => {
    const snap = await buildSnapshot('Admin');
    socket.emit("snapshot", snap);
});

// REST API


app.post("/api/auth/login", (req, res) => {
    const {password} = req.body || {};
    if (!password) {
        return res.status(400).json({error: "Password is required"});
    }

    const user = findUserByPassword(password);
    if (!user) {
        return res.status(401).json({error: "Invalid password"});
    }

    const payload = {
        id: user.id, name: user.name, role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, {expiresIn: "12h"});

    return res.json({
        token, user: payload
    });
});

function requireAuth(req, res, next) {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({error: "Missing Authorization token"});
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload; // { id, name, role }
        next();
    } catch (err) {
        return res.status(401).json({error: "Invalid or expired token"});
    }
}

// roles: "Admin", "Onboard Eng", "Remote Team", "Client"
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({error: "Not authenticated"});
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({error: "Forbidden for this role"});
        }
        next();
    };
}

console.log(endpoints)

app.post(
    "/api/endpoints/:id/assign",
    requireAuth,
    requireRole("Admin", "Onboard Eng"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { userId } = req.body;

            const endpoint = await dbStorage.getEndpoint(id);
            if (!endpoint) {
                return res.status(404).json({ message: "Endpoint not found" });
            }
            const user = users.find(u => u.id === Number(userId));
            if (!user) {
                return res.status(400).json({ message: "User not found" });
            }

            const updated = await dbStorage.updateEndpoint(id, { assignedTo: userId });

            await addLog(
                endpoint.vesselId,
                `Endpoint "${endpoint.label}" assigned to ${user.name} (${user.role})`,
                req
            );

            await broadcastSnapshot();

            res.json({
                message: "Endpoint assigned successfully",
                endpoint: updated,
            });
        } catch (err) {
            console.error('Error assigning endpoint:', err);
            res.status(500).json({ error: "Failed to assign endpoint" });
        }
    }
);


app.post("/api/tasks/:id/assign", requireAuth, requireRole("Admin", "Onboard Eng"), (req, res) => {
    const taskId = Number(req.params.id);
    const {userId} = req.body;
    const task = findTask(taskId);

    if (!task) {
        return res.status(404).json({error: "Task not found"});
    }

    // Validate user exists
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({error: "User not found"});
    }

    task.assignedTo = userId;
    addLog(task.vesselId, `Task "${task.title}" assigned to ${user.name}`, req);
    broadcastSnapshot();

    res.json({success: true, task});
});


app.post("/api/vessels/:id/endpoint-timer/start", requireAuth, (req, res) => {
    const vessel = vessels.find(v => v.id === req.params.id);
    if (!vessel) return res.status(404).json({error: "Vessel not found"});
    //
    // if (
    //     task.assignedTo !== req.user.id &&
    //     req.user.role !== "Admin" &&
    //     req.user.role !== "Onboard Eng"
    // ) {
    //     return res.status(403).json({error: "Not allowed to start this task"});
    // }

    vessel.endpointTimerStart = Date.now();
    vessel.endpointTimerEnd = null;
    vessel.endpointElapsedSeconds = 0;

    addLog(vessel.id, "Endpoint Timer Started", req);
    broadcastSnapshot();
    res.json({ok: true});
});

app.post("/api/vessels/:id/endpoint-timer/stop", requireAuth, (req, res) => {
    const vessel = vessels.find(v => v.id === req.params.id);
    if (!vessel) return res.status(404).json({error: "Vessel not found"});

    vessel.endpointTimerEnd = Date.now();
    vessel.endpointElapsedSeconds = Math.floor((vessel.endpointTimerEnd - vessel.endpointTimerStart) / 1000);

    addLog(vessel.id, "Endpoint Timer Stopped", req);
    broadcastSnapshot();
    res.json({ok: true, elapsed: vessel.endpointElapsedSeconds});
});

// Health check endpoint for deployment
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/health", (req, res) => {
    const dbStatus = dbStorage.isAvailable ? dbStorage.isAvailable() : false;
    res.status(200).json({ 
        status: "ok", 
        database: dbStatus ? "connected" : "unavailable",
        timestamp: new Date().toISOString() 
    });
});

// Root endpoint - serve index.html or return 200 for health checks
app.get("/", (req, res) => {
    const indexPath = path.join(clientDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(200).send("<!DOCTYPE html><html><head><title>Vessel Takeover</title></head><body><h1>iShip Vessel Takeover System</h1><p>Server running. Frontend available in development mode.</p></body></html>");
    }
});

// Vessels
app.get("/api/vessels", async (req, res) => {
    try {
        const userRole = req.user?.role || 'Client';
        const vesselList = await dbStorage.getVessels(userRole);
        res.json({vessels: vesselList});
    } catch (err) {
        console.error('Error getting vessels:', err);
        res.status(500).json({error: "Failed to get vessels"});
    }
});

app.patch("/api/vessels/:id/visibility", requireAuth, requireRole("Admin"), async (req, res) => {
    try {
        const { hidden } = req.body;
        const vessel = await dbStorage.updateVessel(req.params.id, { hidden: !!hidden });
        if (!vessel) {
            return res.status(404).json({error: "Vessel not found"});
        }
        await addLog(vessel.id, `Vessel ${hidden ? 'hidden' : 'shown'} by admin`, req);
        await broadcastSnapshot();
        res.json(vessel);
    } catch (err) {
        console.error('Error updating vessel visibility:', err);
        res.status(500).json({error: "Failed to update vessel"});
    }
});

app.post("/api/vessels", requireAuth, requireRole("Admin", "Onboard Eng"), async (req, res) => {
    const {name, imo} = req.body;
    if (!name) return res.status(400).json({error: "Name required"});
    
    try {
        const vesselId = Date.now() + "-" + Math.random().toString(36).slice(2);
        const vessel = await dbStorage.createVessel({
            id: vesselId,
            name,
            imo: imo || "",
            status: "not_started",
            hidden: false
        });
        
        for (let idx = 0; idx < TEMPLATE_TASKS.length; idx++) {
            const tpl = TEMPLATE_TASKS[idx];
            const tid = Date.now() + idx + Math.random();
            await dbStorage.createTask({
                id: String(tid),
                vesselId: vessel.id,
                title: tpl.title,
                group: tpl.group,
                status: "pending",
                elapsed_seconds: 0,
                deadline_seconds: tpl.deadline_seconds,
                taskNumber: tpl.taskNumber,
                assignedTo: tpl.assignedTo
            });
        }

        const ENDPOINT_NAMES = ["Bridge", "Master", "Shoff", "Shoff 2", "ECR", "ECR 2", "Cheng", "CDR", "CDR 2", "Loader", "Chart"];

        for (const label of ENDPOINT_NAMES) {
            const fields = {...TEMPLATE_ENDPOINT_FIELDS};
            if (label === "Bridge") {
                fields.oneOcean = "pending";
                fields.bvs = "pending";
            }
            if (label === "Master") {
                fields.bvs = "pending";
            }
            await dbStorage.createEndpoint({
                id: Date.now() + "-ep-" + Math.random().toString(36).slice(2),
                vesselId: vessel.id,
                label,
                fields,
                assignedTo: null,
                status: "not_started",
                timerRunning: false,
                elapsedSeconds: 0
            });
        }

        await addLog(vessel.id, `Vessel Created Vessel \"${name}\" created.`, req);
        await broadcastSnapshot();
        res.json(vessel);
    } catch (err) {
        console.error('Error creating vessel:', err);
        res.status(500).json({error: "Failed to create vessel"});
    }
});

// Tasks per vessel
app.get("/api/vessels/:id/tasks", (req, res) => {
    const list = tasks.filter((t) => t.vesselId === req.params.id);
    res.json({tasks: list});
});

app.get("/api/vessels/:id/endpoints", async (req, res) => {
    try {
        const list = await dbStorage.getEndpoints(req.params.id);
        res.json({ endpoints: list });
    } catch (err) {
        console.error('Error fetching endpoints:', err);
        res.status(500).json({ error: "Failed to load endpoints" });
    }
});

app.post("/api/vessels/:id/tasks", requireAuth, requireRole("Admin", "Remote Team"), (req, res) => {
    const vesselId = req.params.id;
    const {title, group} = req.body;
    if (!title) return res.status(400).json({error: "Title required"});
    const task = {
        id: Date.now() + Math.random(),
        vesselId,
        title,
        group: group || "General",
        status: "pending",
        elapsed_seconds: 0,
        deadline_seconds: 3600,
        comments: [],
        attachments: []
    };
    tasks.push(task);
    addLog(vesselId, `Task Created Task "${title}" added.`);
    broadcastSnapshot();
    res.json(task);
});

app.post("/api/endpoints/:id/field", requireAuth, async (req, res) => {
    try {
        const ep = await dbStorage.getEndpoint(req.params.id);
        if (!ep) return res.status(404).json({ error: "Endpoint not found" });

        const { field, value } = req.body;
        if (!field) return res.status(400).json({ error: "Field required" });

        const newFields = { ...(ep.fields || {}), [field]: value || "pending" };
        const updated = await dbStorage.updateEndpoint(ep.id, { fields: newFields });

        await addLog(ep.vesselId, `Endpoint Updated Field "${field}" updated on ${ep.label}`, req);
        await broadcastSnapshot();

        res.json({ ok: true, endpoint: updated });
    } catch (err) {
        console.error('Error updating endpoint field:', err);
        res.status(500).json({ error: "Failed to update endpoint field" });
    }
});

async function findTask(id) {
    return await dbStorage.getTask(id);
}

function findCommentById(task, commentId) {
    return task.comments.find(c => String(c.id) === String(commentId));
}

// app.post("/api/tasks/:id/comment", (req, res) => {
//   const task = findTask(req.params.id);
//   if (!task) return res.status(404).json({ error: "Task not found" });
//
//   const { comment, role, parentId = null } = req.body;
//   if (!comment || !comment.trim()) {
//     return res.status(400).json({ error: "Comment required" });
//   }
//   if (!role) {
//     return res.status(400).json({ error: "Role required (engineer/client)" });
//   }
//
//   if (!Array.isArray(task.comments)) task.comments = [];
//
//   const entry = {
//     id: Date.now().toString(),
//     text: comment,
//     role,
//     parentId,
//     timestamp: new Date().toISOString()
//   };
//
//   task.comments.push(entry);
//
//   addLog(
//     task.vesselId,
//     task.id,
//     "COMMENT_ADDED",
//     `${role} added comment on "${task.title}".`
//   );
//
//   broadcastSnapshot();
//   res.json({ ok: true, comment: entry });
// });

app.post("/api/tasks/:id/comment", requireAuth, async (req, res) => {
    try {
        const {comment, parentId} = req.body || {};
        const task = await findTask(req.params.id);
        if (!task) {
            return res.status(404).json({error: "Task not found"});
        }
        if (!comment) {
            return res.status(400).json({error: "Comment text is required"});
        }

        const newComment = {
            id: Date.now(),
            text: comment,
            role: req.user.role,
            authorId: req.user.id,
            authorName: req.user.name,
            parentId: parentId || null
        };

        await dbStorage.addComment(task.id, newComment);
        await addLog(task.vesselId, `${req.user.role} added a comment on task "${task.title}"`, req);
        await broadcastSnapshot();
        
        sendNotification('COMMENT_ADDED', {
            taskTitle: task.title,
            comment: comment.substring(0, 100)
        });
        
        res.json(newComment);
    } catch (err) {
        console.error('Error adding comment:', err);
        res.status(500).json({error: "Failed to add comment"});
    }
});

app.put("/api/comment/:id", requireAuth, requireRole('Admin'), (req, res) => {
    const {comment} = req.body;
    if (!comment || !comment.trim()) {
        return res.status(400).json({error: "New comment text required"});
    }

    let foundTask = null;
    let foundComment = null;

    for (const t of tasks) {
        if (t.comments) {
            const c = t.comments.find(x => String(x.id) === String(req.params.id));
            if (c) {
                foundTask = t;
                foundComment = c;
                break;
            }
        }
    }

    if (!foundComment) return res.status(404).json({error: "Comment not found"});

    foundComment.text = comment;
    foundComment.timestamp = new Date().toISOString();

    addLog(foundTask.vesselId, `Comment Deleted Comment updated on "${foundTask.title}"`, req);
    broadcastSnapshot();
    res.json({ok: true});
});

// Delete vessel (Admin only)
app.delete(
    "/api/vessels/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
        const {id} = req.params;

        const vesselIndex = vessels.findIndex(v => v.id === id);
        if (vesselIndex === -1) {
            return res.status(404).json({error: "Vessel not found"});
        }

        const vessel = vessels[vesselIndex];

        // Remove vessel itself
        vessels.splice(vesselIndex, 1);

        // Cascade delete related tasks, endpoints, and logs
        // (optional but usually what you want)
        for (let i = tasks.length - 1; i >= 0; i--) {
            if (tasks[i].vesselId === id) tasks.splice(i, 1);
        }
        for (let i = endpoints.length - 1; i >= 0; i--) {
            if (endpoints[i].vesselId === id) endpoints.splice(i, 1);
        }
        for (let i = logs.length - 1; i >= 0; i--) {
            if (logs[i].vesselId === id) logs.splice(i, 1);
        }

        // Log audit entry with IP etc (your addLog already uses req.user and req.ip)
        addLog(id, `Vessel Deleted Vessel "${vessel.name}" deleted by ${req.user.name}`, req);

        broadcastSnapshot();
        return res.json({ok: true});
    }
);

app.put(
    "/api/vessels/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
        const {id} = req.params;
        const {name} = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({error: "Name is required"});
        }

        const vessel = vessels.find((v) => v.id === id);
        if (!vessel) {
            return res.status(404).json({error: "Vessel not found"});
        }

        const oldName = vessel.name;
        vessel.name = name.trim();

        addLog(
            vessel.id,
            `Vessel Renamed "${oldName}" → "${vessel.name}"`,
            req
        );

        broadcastSnapshot();
        return res.json({vessel});
    }
);


app.delete("/api/comment/:id", requireAuth, requireRole('Admin'), (req, res) => {
    const commentId = String(req.params.id);

    tasks.forEach(t => {
        if (Array.isArray(t.comments)) {
            // remove root + replies
            const removeThread = (id) => {
                const children = t.comments.filter(c => String(c.parentId) === String(id));
                t.comments = t.comments.filter(c => String(c.id) !== String(id));
                children.forEach(child => removeThread(child.id));
            };
            removeThread(commentId);
        }
    });

    broadcastSnapshot();
    res.json({ok: true});
});

app.delete("/api/tasks/:id", requireAuth, requireRole('Admin'), (req, res) => {
    const task = findTask(req.params.id);
    if (!task) return res.status(404).json({error: "Task not found"});
    tasks = tasks.filter((t) => String(t.id) !== String(req.params.id));
    addLog(task.vesselId, `Task Deleted Task "${task.title}" removed.`, req);
    broadcastSnapshot();
    res.json({ok: true});
});

app.post("/api/tasks/reorder", requireAuth, (req, res) => {
    const {vesselId, order} = req.body;
    if (!vesselId || !Array.isArray(order)) {
        return res.status(400).json({error: "vesselId and order[] required"});
    }
    const vesselTasks = tasks.filter((t) => t.vesselId === vesselId);
    const idToTask = new Map(vesselTasks.map((t) => [String(t.id), t]));
    const reordered = [];
    order.forEach((id) => {
        const task = idToTask.get(String(id));
        if (task) reordered.push(task);
    });
    const others = tasks.filter((t) => t.vesselId !== vesselId);
    tasks = others.concat(reordered);
    addLog(vesselId, "Tasks Reordered Task order updated.", req);
    broadcastSnapshot();
    res.json({ok: true});
});

app.post("/api/tasks/:id/start", requireAuth, requireRole("Admin", "Onboard Eng", "Remote Team"), async (req, res) => {
    try {
        const task = await findTask(req.params.id);
        if (!task) return res.status(404).json({error: "Task not found"});

        const isAdminOrEngineer = req.user.role === "Admin" || req.user.role === "Onboard Eng";

        if (task.assignedTo !== req.user.id && !isAdminOrEngineer) {
            return res.status(403).json({error: "You are not assigned to this task."});
        }

        if (task.status !== "pending" && task.status !== "paused") {
            return res.status(400).json({error: "Task cannot be started from this state."});
        }

        await dbStorage.updateTask(task.id, { status: "in_progress" });
        const vessel = await dbStorage.getVessel(task.vesselId);
        if (vessel && vessel.status === "not_started") {
            await dbStorage.updateVessel(vessel.id, { status: "in_progress" });
        }

        await addLog(task.vesselId, `${req.user.name} started "${task.title}"`, req);
        await broadcastSnapshot();
        
        sendNotification('TASK_STARTED', {
            taskTitle: task.title,
            expectedTime: task.deadline_seconds
        });
        
        const updatedTask = await findTask(req.params.id);
        res.json(updatedTask);
    } catch (err) {
        console.error('Error starting task:', err);
        res.status(500).json({error: "Failed to start task"});
    }
});

app.post("/api/tasks/:id/pause", requireAuth, async (req, res) => {
    try {
        const task = await findTask(req.params.id);
        if (!task) return res.status(404).json({error: "Task not found"});

        const isAdminOrEngineer = req.user.role === "Admin" || req.user.role === "Onboard Eng";

        if (task.assignedTo !== req.user.id && !isAdminOrEngineer) {
            return res.status(403).json({error: "You are not assigned to this task."});
        }

        if (task.status !== "in_progress") {
            return res.status(400).json({error: "Only an in-progress task can be paused."});
        }

        await dbStorage.updateTask(task.id, { status: "paused" });
        await addLog(task.vesselId, `${req.user.name} paused "${task.title}"`, req);
        await broadcastSnapshot();
        
        sendNotification('TASK_PAUSED', {
            taskTitle: task.title
        });
        
        res.json({success: true, taskId: task.id});
    } catch (err) {
        console.error('Error pausing task:', err);
        res.status(500).json({error: "Failed to pause task"});
    }
});


app.post("/api/tasks/:id/done", requireAuth, requireRole("Admin", "Onboard Eng", "Remote Team"), async (req, res) => {
    try {
        const task = await findTask(req.params.id);
        if (!task) return res.status(404).json({error: "Task not found"});
        if (task.status !== "in_progress" && task.status !== "paused") {
            return res.status(400).json({error: "Only active or paused tasks can be marked done."});
        }
        
        await dbStorage.updateTask(task.id, { status: "done" });
        await addLog(task.vesselId, `Task Done Task "${task.title}" completed.`, req);

        const vesselTasks = await dbStorage.getTasks(task.vesselId);
        const vessel = await dbStorage.getVessel(task.vesselId);
        if (vesselTasks.every((t) => t.status === "done")) {
            if (vessel) await dbStorage.updateVessel(vessel.id, { status: "completed" });
        }

        await broadcastSnapshot();
        
        sendNotification('TASK_DONE', {
            taskTitle: task.title
        });
        
        const updatedTask = await findTask(req.params.id);
        res.json(updatedTask);
    } catch (err) {
        console.error('Error completing task:', err);
        res.status(500).json({error: "Failed to complete task"});
    }
});

app.post("/api/tasks/:id/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
        const task = await findTask(req.params.id);
        if (!task) return res.status(404).json({error: "Task not found"});
        const url = `/uploads/${req.file.filename}`;
        await dbStorage.addAttachment(task.id, {
            url,
            originalName: req.file.originalname
        });
        await addLog(task.vesselId, `Attachment Added Screenshot uploaded for "${task.title}".`, req);
        await broadcastSnapshot();
        res.json({ok: true, url});
    } catch (err) {
        console.error('Error uploading file:', err);
        res.status(500).json({error: "Failed to upload file"});
    }
});

function canControlEndpoint(endpoint, user) {
    if (!user) return false;

    // Admin can always control
    if (user.role === "Admin") return true;

    // If endpoint is assigned, only that user can control
    if (endpoint.assignedTo) {
        return Number(endpoint.assignedTo) === user.id;
    }

    // If no assignee yet, only Admin can control. Non admin cannot.
    return false;
}


// Start endpoint timer
app.post("/api/endpoints/:id/start", requireAuth, async (req, res) => {
    try {
        const ep = await dbStorage.getEndpoint(req.params.id);
        if (!ep) return res.status(404).json({ error: "Endpoint not found" });

        if (!canControlEndpoint(ep, req.user)) {
            return res.status(403).json({
                message: "You are not allowed to control this endpoint timer",
            });
        }

        if (ep.status === "done") {
            return res.status(400).json({ error: "Endpoint already completed" });
        }

        const updated = await dbStorage.updateEndpoint(ep.id, {
            status: "in_progress",
            timerRunning: true
        });

        await addLog(ep.vesselId, `Endpoint Started Endpoint "${ep.label}" started`, req);
        await broadcastSnapshot();
        res.json({ ok: true, endpoint: updated });
    } catch (err) {
        console.error('Error starting endpoint:', err);
        res.status(500).json({ error: "Failed to start endpoint" });
    }
});

// Pause endpoint timer
app.post("/api/endpoints/:id/pause", requireAuth, async (req, res) => {
    try {
        const ep = await dbStorage.getEndpoint(req.params.id);
        if (!ep) return res.status(404).json({ error: "Endpoint not found" });

        if (ep.status !== "in_progress") {
            return res.status(400).json({ error: "Only in progress endpoint can be paused" });
        }

        const updated = await dbStorage.updateEndpoint(ep.id, {
            status: "paused",
            timerRunning: false
        });

        await addLog(ep.vesselId, `Endpoint Paused Endpoint "${ep.label}" paused`, req);
        await broadcastSnapshot();
        res.json({ ok: true, endpoint: updated });
    } catch (err) {
        console.error('Error pausing endpoint:', err);
        res.status(500).json({ error: "Failed to pause endpoint" });
    }
});

// Mark endpoint done
app.post("/api/endpoints/:id/done", requireAuth, async (req, res) => {
    try {
        const ep = await dbStorage.getEndpoint(req.params.id);
        if (!ep) return res.status(404).json({ error: "Endpoint not found" });

        if (!canControlEndpoint(ep, req.user)) {
            return res.status(403).json({
                message: "You are not allowed to control this endpoint timer",
            });
        }

        if (ep.status === "done") {
            return res.status(400).json({ error: "Endpoint already done" });
        }

        const updated = await dbStorage.updateEndpoint(ep.id, {
            status: "done",
            timerRunning: false
        });

        await addLog(ep.vesselId, `Endpoint Done Endpoint "${ep.label}" marked done`, req);
        await broadcastSnapshot();
        res.json({ ok: true, endpoint: updated });
    } catch (err) {
        console.error('Error completing endpoint:', err);
        res.status(500).json({ error: "Failed to complete endpoint" });
    }
});


app.get("/api/vessels/:id/logs", (req, res) => {
    const vesselLogs = logs.filter((l) => l.vesselId === req.params.id);
    res.json({logs: vesselLogs});
});

// WhatsApp API routes
app.get("/api/whatsapp/status", requireAuth, requireRole("Admin"), (req, res) => {
    res.json(getWhatsAppStatus());
});

app.get("/api/whatsapp/qr", requireAuth, requireRole("Admin"), (req, res) => {
    const qr = getQrCode();
    if (qr) {
        res.json({ qrCode: qr });
    } else {
        res.json({ qrCode: null, message: "No QR code available" });
    }
});

app.post("/api/whatsapp/init", requireAuth, requireRole("Admin"), (req, res) => {
    initWhatsApp();
    scheduleReconnect();
    res.json({ message: "WhatsApp initialization started" });
});

app.post("/api/whatsapp/stop", requireAuth, requireRole("Admin"), async (req, res) => {
    try {
        await stopWhatsApp();
        res.json({ message: "WhatsApp client stopped" });
    } catch (err) {
        console.error('Error stopping WhatsApp:', err);
        res.status(500).json({ error: "Failed to stop WhatsApp client" });
    }
});

app.get("/api/whatsapp/groups", requireAuth, requireRole("Admin"), async (req, res) => {
    try {
        const groups = await getWhatsAppGroups();
        res.json({ groups });
    } catch (err) {
        res.status(500).json({ error: "Failed to get groups" });
    }
});

app.post("/api/whatsapp/set-group", requireAuth, requireRole("Admin"), (req, res) => {
    const { groupId } = req.body;
    if (!groupId) {
        return res.status(400).json({ error: "groupId required" });
    }
    setGroupChatId(groupId);
    res.json({ message: "Group set successfully", groupId });
});

// Catch-all route - serve index.html for client-side routing (production only)
app.get("*", (req, res) => {
    const indexPath = path.join(clientDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: "Not found - running in development mode" });
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
    console.log("Server listening on http://0.0.0.0:" + PORT);
});
