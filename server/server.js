import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"]
  }
});

app.use(cors());
app.use(express.json());

// static for uploaded files
const uploadsDir = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const ENGINEER_KEY = "secret-engineer-key";

function requireEngineer(req, res, next) {
  const key = req.header("X-API-KEY");
  if (key !== ENGINEER_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// In-memory DB
let vessels = [];
let tasks = [];
let logs = [];
let endpoints = [];

function addLog(vesselId, taskId, action, message) {
  const entry = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2),
    vesselId,
    taskId,
    action,
    message,
    timestamp: new Date().toISOString()
  };
  logs.push(entry);
  broadcastSnapshot();
}

const TASK_GROUPS = [
  "Network Setup",
  "Email & Communication",
  "Software Installations",
  "Server Setup",
  "Verification & Handover"
];

const TEMPLATE_TASKS = [
  /* ------------------------------
     Section: Checking Old Systems
     ------------------------------ */
  {
    title: "Task 1: Verify server rack location and ventilation",
    group: "Checking Old Systems",
    deadline_seconds: 30 * 60,
    comments: [],
    attachments: [],
    taskNumber: 1
  },
  /* ------------------------------
     Section: Network Setup
     ------------------------------ */
  {
    title: "Task 2: Identify managed switches and trace cables",
    group: "Network Setup",
    deadline_seconds: 45 * 60,
    comments: [],
    attachments: [],
    taskNumber: 2
  },
  {
    title: "Task 3: Checking all WANs (SL1, SL2, VSAT etc) - Active or Not",
    group: "Network Setup",
    deadline_seconds: 60 * 60,
    comments: [],
    attachments: [],
    taskNumber: 3
  },
  {
    title: "Task 4: Connect EVO router with current onboard setup",
    group: "Network Setup",
    deadline_seconds: 60 * 60,
    comments: [],
    attachments: [],
    taskNumber: 4
  },
  {
    title: "Task 5: Crew WiFi - UNIFI",
    group: "Network Setup",
    deadline_seconds: 60 * 60,
    comments: [],
    attachments: [],
    taskNumber: 5
  },
  /* ------------------------------
     Section: Mail Server Setup
     ------------------------------ */
  {
    title: "Task 6: Setting up VM for Mail Server",
    group: "Mail Server Setup",
    deadline_seconds: 60 * 60,
    comments: [],
    attachments: [],
    taskNumber: 6
  },
  {
    title: "Task 7: Mail Server Setup",
    group: "Mail Server Setup",
    deadline_seconds: 60 * 60,
    comments: [],
    attachments: [],
    taskNumber: 7
  },
  {
    title: "Task 8: Verifying Test Email",
    group: "Mail Server Setup",
    deadline_seconds: 5 * 60,
    comments: [],
    attachments: [],
    taskNumber: 8
  },
  /* ------------------------------
     Section: Endpoints
     ------------------------------ */
  {
    title: "Task 9: Go to Endpoint Tab to Start Work",
    group: "Endpoints",
    deadline_seconds: 3 * 60 * 60,
    comments: [],
    attachments: [],
    taskNumber: 9
  },
  /* ------------------------------
     Section: Server Setup
     ------------------------------ */
  {
    title: "Task 10: Setting up VM for Software",
    group: "Server Setup",
    deadline_seconds: 60 * 60,
    comments: [],
    attachments: [],
    taskNumber: 10
  },
  {
    title: "Task 11: Installing softwares in VM",
    group: "Server Setup",
    deadline_seconds: 2 * 60 * 60,
    comments: [],
    attachments: [],
    taskNumber: 11
  },
  /* ------------------------------
     Section: Verification
     ------------------------------ */
  {
    title: "Task 12: Verify all applications, TV, mails, SOC agent, WiFi from Captain",
    group: "Verification",
    deadline_seconds: 30 * 60,
    comments: [],
    attachments: [],
    taskNumber: 12
  },
  {
    title: "Task 13: Sign Off – Get UAT & SR Signed from Master",
    group: "Verification",
    deadline_seconds: 15 * 60,
    comments: [],
    attachments: [],
    taskNumber: 13
  }
];

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

  const ENDPOINT_NAMES = [
    "Bridge",
    "Master",
    "Shoff",
    "Shoff 2",
    "ECR",
    "ECR 2",
    "Cheng",
    "CDR",
    "CDR 2",
    "Loader",
    "Chart"
  ];

  ENDPOINT_NAMES.forEach((label) => {
    endpoints.push({
      id: Date.now() + "-ep-" + Math.random().toString(36).slice(2),
      vesselId: vessel.id,
      label,
      fields: { ...TEMPLATE_ENDPOINT_FIELDS }
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

  addLog(id, null, "VESSEL_CREATED", `Vessel "${name}" created with template tasks.`);
}

seedInitial();

// Timer: increment elapsed_seconds on in_progress tasks
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const diff = Math.floor((now - lastTick) / 1000);
  if (diff <= 0) return;
  lastTick = now;
  let changed = false;
  tasks.forEach((t) => {
    if (t.status === "in_progress") {
      t.elapsed_seconds = (t.elapsed_seconds || 0) + diff;
      changed = true;
    }
  });
  vessels.forEach(v => {
    if (v.endpointTimerStart && !v.endpointTimerEnd) {
      v.endpointElapsedSeconds = Math.floor((Date.now() - v.endpointTimerStart) / 1000);
      changed = true;
    }
  });
  if (changed) broadcastSnapshot();
}, 1000);

function snapshot() {
  return {
    vessels,
    tasks,
    logs,
    endpoints
  };
}

function broadcastSnapshot() {
  io.emit("snapshot", snapshot());
}

// Socket connections
io.on("connection", (socket) => {
  socket.emit("snapshot", snapshot());
});

// REST API

app.post("/api/vessels/:id/endpoint-timer/start", requireEngineer, (req, res) => {
  const vessel = vessels.find(v => v.id === req.params.id);
  if (!vessel) return res.status(404).json({ error: "Vessel not found" });

  vessel.endpointTimerStart = Date.now();
  vessel.endpointTimerEnd = null;
  vessel.endpointElapsedSeconds = 0;

  addLog(vessel.id, null, "ENDPOINT_TIMER_STARTED", "Endpoint checklist timer started");
  broadcastSnapshot();
  res.json({ ok: true });
});

app.post("/api/vessels/:id/endpoint-timer/stop", requireEngineer, (req, res) => {
  const vessel = vessels.find(v => v.id === req.params.id);
  if (!vessel) return res.status(404).json({ error: "Vessel not found" });

  vessel.endpointTimerEnd = Date.now();
  vessel.endpointElapsedSeconds = Math.floor((vessel.endpointTimerEnd - vessel.endpointTimerStart) / 1000);

  addLog(vessel.id, null, "ENDPOINT_TIMER_STOPPED", "Endpoint checklist timer stopped");
  broadcastSnapshot();
  res.json({ ok: true, elapsed: vessel.endpointElapsedSeconds });
});

// Vessels
app.get("/api/vessels", (req, res) => {
  res.json({ vessels });
});

app.post("/api/vessels", requireEngineer, (req, res) => {
  const { name, imo } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  const vessel = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2),
    name,
    imo: imo || "",
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
      vesselId: vessel.id,
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

  const ENDPOINT_NAMES = [
    "Bridge",
    "Master",
    "Shoff",
    "Shoff 2",
    "ECR",
    "ECR 2",
    "Cheng",
    "CDR",
    "CDR 2",
    "Loader",
    "Chart"
  ];

  ENDPOINT_NAMES.forEach((label) => {
    endpoints.push({
      id: Date.now() + "-ep-" + Math.random().toString(36).slice(2),
      vesselId: vessel.id,
      label,
      fields: { ...TEMPLATE_ENDPOINT_FIELDS }
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

  addLog(vessel.id, null, "VESSEL_CREATED", `Vessel "${name}" created.`);
  broadcastSnapshot();
  res.json(vessel);
});

// Tasks per vessel
app.get("/api/vessels/:id/tasks", (req, res) => {
  const list = tasks.filter((t) => t.vesselId === req.params.id);
  res.json({ tasks: list });
});

app.get("/api/vessels/:id/endpoints", (req, res) => {
  const list = endpoints.filter(e => e.vesselId === req.params.id);
  res.json({ endpoints: list });
});

app.post("/api/vessels/:id/tasks", requireEngineer, (req, res) => {
  const vesselId = req.params.id;
  const { title, group } = req.body;
  if (!title) return res.status(400).json({ error: "Title required" });
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
  addLog(vesselId, task.id, "TASK_CREATED", `Task "${title}" added.`);
  broadcastSnapshot();
  res.json(task);
});

app.post("/api/endpoints/:id/field", requireEngineer, (req, res) => {
  const ep = endpoints.find(e => String(e.id) === String(req.params.id));
  if (!ep) return res.status(404).json({ error: "Endpoint not found" });

  const { field, value } = req.body;
  if (!field) return res.status(400).json({ error: "Field required" });

  ep.fields[field] = value || "pending";

  addLog(ep.vesselId, null, "ENDPOINT_UPDATED", `Field "${field}" updated on ${ep.label}`);
  broadcastSnapshot();

  res.json({ ok: true, endpoint: ep });
});

function findTask(id) {
  return tasks.find((t) => String(t.id) === String(id));
}

function findCommentById(task, commentId) {
  return task.comments.find(c => String(c.id) === String(commentId));
}

app.post("/api/tasks/:id/comment", (req, res) => {
  const task = findTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { comment, role, parentId = null } = req.body;
  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: "Comment required" });
  }
  if (!role) {
    return res.status(400).json({ error: "Role required (engineer/client)" });
  }

  if (!Array.isArray(task.comments)) task.comments = [];

  const entry = {
    id: Date.now().toString(),
    text: comment,
    role,
    parentId,
    timestamp: new Date().toISOString()
  };

  task.comments.push(entry);

  addLog(
    task.vesselId,
    task.id,
    "COMMENT_ADDED",
    `${role} added comment on "${task.title}".`
  );

  broadcastSnapshot();
  res.json({ ok: true, comment: entry });
});

app.put("/api/comment/:id", (req, res) => {
  const { comment } = req.body;
  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: "New comment text required" });
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

  if (!foundComment) return res.status(404).json({ error: "Comment not found" });

  foundComment.text = comment;
  foundComment.timestamp = new Date().toISOString();

  addLog(foundTask.vesselId, foundTask.id, "COMMENT_EDITED", `Comment updated on "${foundTask.title}"`);
  broadcastSnapshot();
  res.json({ ok: true });
});

app.delete("/api/comment/:id", (req, res) => {
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
  res.json({ ok: true });
});

app.delete("/api/tasks/:id", requireEngineer, (req, res) => {
  const task = findTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  tasks = tasks.filter((t) => String(t.id) !== String(req.params.id));
  addLog(task.vesselId, task.id, "TASK_DELETED", `Task "${task.title}" removed.`);
  broadcastSnapshot();
  res.json({ ok: true });
});

app.post("/api/tasks/reorder", requireEngineer, (req, res) => {
  const { vesselId, order } = req.body;
  if (!vesselId || !Array.isArray(order)) {
    return res.status(400).json({ error: "vesselId and order[] required" });
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
  addLog(vesselId, null, "TASKS_REORDERED", "Task order updated.");
  broadcastSnapshot();
  res.json({ ok: true });
});

app.post("/api/tasks/:id/start", requireEngineer, (req, res) => {
  const task = findTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  // Only one active per vessel
  tasks.forEach((t) => {
    if (t.vesselId === task.vesselId && t.status === "in_progress") {
      t.status = "pending";
    }
  });

  task.status = "in_progress";
  const vessel = vessels.find((v) => v.id === task.vesselId);
  if (vessel && vessel.status === "not_started") vessel.status = "in_progress";

  addLog(task.vesselId, task.id, "TASK_STARTED", `Task "${task.title}" started.`);
  broadcastSnapshot();
  res.json(task);
});

app.post("/api/tasks/:id/done", requireEngineer, (req, res) => {
  const task = findTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.status = "done";
  addLog(task.vesselId, task.id, "TASK_DONE", `Task "${task.title}" completed.`);

  const vesselTasks = tasks.filter((t) => t.vesselId === task.vesselId);
  if (vesselTasks.every((t) => t.status === "done")) {
    const vessel = vessels.find((v) => v.id === task.vesselId);
    if (vessel) vessel.status = "completed";
  }

  broadcastSnapshot();
  res.json(task);
});

app.post("/api/tasks/:id/upload", requireEngineer, upload.single("file"), (req, res) => {
  const task = findTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!task.attachments) task.attachments = [];
  const url = `/uploads/${req.file.filename}`;
  task.attachments.push({
    url,
    originalName: req.file.originalname,
    uploadedAt: new Date().toISOString()
  });
  addLog(task.vesselId, task.id, "ATTACHMENT_ADDED", `Screenshot uploaded for "${task.title}".`);
  broadcastSnapshot();
  res.json({ ok: true, url });
});

app.get("/api/vessels/:id/logs", (req, res) => {
  const vesselLogs = logs.filter((l) => l.vesselId === req.params.id);
  res.json({ logs: vesselLogs });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log("Server listening on http://localhost:" + PORT);
});