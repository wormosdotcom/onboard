import React, { useEffect, useState, useMemo } from "react";
import { io } from "socket.io-client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "./App.css";

const socket = io("https://onboard-x570.onrender.com", { autoConnect: true });

const formatTime = (sec = 0) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h > 0 ? h + "h " : ""}${m > 0 ? m + "m " : ""}${s}s`;
};

const formatTS = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
};

const GROUP_COLORS = {
  "Checking Old Systems": "#4a6fa5",
  "Network Setup": "#166534",
  "Mail Server Setup": "#3c8dad",
  "Endpoints": "#e29d33",
  "Server Setup": "#7b4bbf",
  "Verification": "#e11d48",
  General: "#9ca3af"
};

const ENDPOINT_FIELD_LABELS = {
  tv: "TV",
  adminAcc: "Admin Acc",
  accDisabled: "Acc Disabled",
  windowsKey: "Windows Key",
  softwareList: "Software List",
  staticIP: "Static IP",
  noSleep: "No Sleep",
  rdEnabled: "RDP Enabled",
  crowdstrike: "Crowdstrike",
  defender: "Defender",
  soc: "SOC",
  emailBackup: "Email Backup",
  navis: "Navis",
  emailSetup: "Email Setup",
  mack: "MACK",
  ns5: "NS5",
  olp: "OLP",
  compas: "COMPAS",
  ibis: "IBIS",
  oss: "OSS",
  proxyOff: "Proxy Off",
  rdpSoftwares: "RDP Softwares",
  oneOcean: "One Ocean",
  bvs: "BVS"
};

export default function App() {
  const [snapshot, setSnapshot] = useState({ vessels: [], tasks: [], logs: [] });
  const [selectedVesselId, setSelectedVesselId] = useState(null);
  const [role, setRole] = useState("client"); // engineer | client
  // Engineer authentication state
  const [engineerAuthenticated, setEngineerAuthenticated] = useState(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [uploadingTaskId, setUploadingTaskId] = useState(null);
  const [collapsedComments, setCollapsedComments] = useState({});
  const [previewImage, setPreviewImage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks"); // tasks | endpoints | activity
  const toggleComments = (taskId) => {
    setCollapsedComments(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  // Passcode modal submit handler
  const handlePasscodeSubmit = () => {
    if (passcode === "220322") {
      setEngineerAuthenticated(true);
      setRole("engineer");
      setShowPasscodeModal(false);
      setPasscode("");
    } else {
      // Optionally: add shake animation here via CSS class
    }
  };

  useEffect(() => {
    socket.on("snapshot", (data) => {
      setSnapshot(data);
      if (!selectedVesselId && data.vessels?.length) {
        setSelectedVesselId(data.vessels[0].id);
      }
    });
    return () => socket.off("snapshot");
  }, [selectedVesselId]);

  const vessels = snapshot.vessels || [];
  const tasks = snapshot.tasks || [];
  const logs = snapshot.logs || [];
  const endpoints = snapshot.endpoints || [];

  const selectedVessel = useMemo(
    () => vessels.find((v) => v.id === selectedVesselId) || null,
    [vessels, selectedVesselId]
  );

  const vesselTasks = useMemo(
    () => tasks.filter((t) => t.vesselId === selectedVesselId),
    [tasks, selectedVesselId]
  );

  const vesselLogs = useMemo(
    () => logs.filter((l) => l.vesselId === selectedVesselId).slice().sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [logs, selectedVesselId]
  );

  const vesselEndpoints = useMemo(
    () => endpoints.filter((e) => e.vesselId === selectedVesselId),
    [endpoints, selectedVesselId]
  );

  const cycleEndpointStatus = (val) => {
    if (val === "done") return "na";
    if (val === "na") return "pending";
    return "done";
  };

  const handleEndpointFieldChange = async (endpointId, field) => {
    if (role !== "engineer") return;
    const ep = vesselEndpoints.find((e) => e.id === endpointId);
    const current = (ep && ep.fields && ep.fields[field]) || "pending";
    const next = cycleEndpointStatus(current);
    await fetch(`https://onboard-x570.onrender.com/api/endpoints/${endpointId}/field`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": "secret-engineer-key"
      },
      body: JSON.stringify({ field, value: next })
    });
  };

  const summary = useMemo(() => {
    const total = vesselTasks.length;
    const done = vesselTasks.filter((t) => t.status === "done").length;
    const inProgress = vesselTasks.filter((t) => t.status === "in_progress").length;
    const delayed = vesselTasks.filter((t) => (t.elapsed_seconds || 0) > (t.deadline_seconds || 3600)).length;
    const remaining = total - done;
    const elapsedTotal = vesselTasks.reduce((acc, t) => acc + (t.elapsed_seconds || 0), 0);
    return { total, done, inProgress, delayed, remaining, elapsedTotal };
  }, [vesselTasks]);

  const handleAddVessel = async () => {
    if (role !== "engineer") return;
    const name = window.prompt("Vessel name:");
    if (!name) return;
    const imo = window.prompt("IMO number (optional):") || "";
    await fetch("https://onboard-x570.onrender.com/api/vessels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": "secret-engineer-key"
      },
      body: JSON.stringify({ name, imo })
    });
  };

  const handleAddTask = async () => {
    if (role !== "engineer" || !selectedVesselId) return;
    const title = window.prompt("Task title:");
    if (!title) return;
    const group =
      window.prompt(
        "Task group: Network Setup / Email & Communication / Software Installations / Server Setup / Verification & Handover / General"
      ) || "General";
    await fetch(`https://onboard-x570.onrender.com/api/vessels/${selectedVesselId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": "secret-engineer-key"
      },
      body: JSON.stringify({ title, group })
    });
  };

  const handleStartTask = async (taskId) => {
    if (role !== "engineer") return;
    await fetch(`https://onboard-x570.onrender.com/api/tasks/${taskId}/start`, {
      method: "POST",
      headers: { "X-API-KEY": "secret-engineer-key" }
    });
  };

  const handleDoneTask = async (taskId) => {
    if (role !== "engineer") return;
    await fetch(`https://onboard-x570.onrender.com/api/tasks/${taskId}/done`, {
      method: "POST",
      headers: { "X-API-KEY": "secret-engineer-key" }
    });
  };

  const handleDeleteTask = async (taskId) => {
    if (role !== "engineer") return;
    if (!window.confirm("Remove this task?")) return;
    await fetch(`https://onboard-x570.onrender.com/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: { "X-API-KEY": "secret-engineer-key" }
    });
  };

  const handleSaveComment = async (taskId, parentId = null) => {
    const comment = window.prompt("Enter comment:");
    if (!comment) return;
    await fetch(`https://onboard-x570.onrender.com/api/tasks/${taskId}/comment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ comment, role, parentId })
    });
  };

  const handleEditComment = async (commentId) => {
    const newText = window.prompt("Edit comment:");
    if (!newText) return;
    await fetch(`https://onboard-x570.onrender.com/api/comment/${commentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: newText })
    });
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm("Delete this comment & all replies?")) return;
    await fetch(`https://onboard-x570.onrender.com/api/comment/${commentId}`, {
      method: "DELETE"
    });
  };

  const handleUpload = async (taskId, file) => {
    if (role !== "engineer") return;
    if (!file) return;
    setUploadingTaskId(taskId);
    const form = new FormData();
    form.append("file", file);
    await fetch(`https://onboard-x570.onrender.com/api/tasks/${taskId}/upload`, {
      method: "POST",
      headers: {
        "X-API-KEY": "secret-engineer-key"
      },
      body: form
    });
    setUploadingTaskId(null);
  };

  const onDragEnd = async (result) => {
    if (role !== "engineer") return;
    if (!result.destination || !selectedVesselId) return;

    const newTasks = Array.from(vesselTasks);
    const [moved] = newTasks.splice(result.source.index, 1);
    newTasks.splice(result.destination.index, 0, moved);

    const order = newTasks.map((t) => t.id);

    await fetch("https://onboard-x570.onrender.com/api/tasks/reorder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": "secret-engineer-key"
      },
      body: JSON.stringify({ vesselId: selectedVesselId, order })
    });
  };

  const handleExportPDF = async () => {
    // Force-expand comments
    setCollapsedComments({});
    await new Promise(r => setTimeout(r, 150));

    // Timestamp for watermark
    const timestamp = new Date().toLocaleString();

    if (activeTab === "tasks") {
      // --- TASKS PDF ---
      const tasksCon = document.createElement("div");
      tasksCon.style.padding = "20px";
      tasksCon.style.background = "#fff";
      tasksCon.style.width = "1600px";
      tasksCon.style.maxWidth = "1600px";
      tasksCon.style.overflow = "visible";
      tasksCon.style.margin = "0 auto";
      tasksCon.classList.add("print-mode");
      // Clone tasks panel
      const tasksPanel = document.querySelector(".tasks-column");
      if (tasksPanel) {
        const clonedTasks = tasksPanel.cloneNode(true);
        const header = document.createElement("h2");
        header.innerText = "Tasks Overview";
        header.style.marginBottom = "16px";
        tasksCon.appendChild(header);
        tasksCon.appendChild(clonedTasks);
      }
      document.body.appendChild(tasksCon);
      const tasksCanvas = await html2canvas(tasksCon, {
        scale: 2,
        useCORS: true,
        scrollY: -window.scrollY,
        scrollX: -window.scrollX,
        backgroundColor: "#fff"
      });
      const tasksImgData = tasksCanvas.toDataURL("image/png");
      const tasksPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const tPageWidth = tasksPdf.internal.pageSize.getWidth();
      const tPageHeight = tasksPdf.internal.pageSize.getHeight();
      const tImgProps = tasksPdf.getImageProperties(tasksImgData);
      const tImgHeight = (tImgProps.height * tPageWidth) / tImgProps.width;
      let tRemainingHeight = tImgHeight;
      let tY = 0;
      tasksPdf.addImage(tasksImgData, "PNG", 0, 0, tPageWidth, tImgHeight);
      tasksPdf.setFontSize(6);
      tasksPdf.setTextColor(100);
      tasksPdf.text(`Downloaded from iShip Takeover • ${timestamp}`, 10, tPageHeight - 4);
      tRemainingHeight -= tPageHeight;
      tY -= tPageHeight;
      while (tRemainingHeight > 0) {
        tasksPdf.addPage();
        tasksPdf.addImage(tasksImgData, "PNG", 0, tY, tPageWidth, tImgHeight);
        tasksPdf.setFontSize(6);
        tasksPdf.setTextColor(100);
        tasksPdf.text(`Downloaded from iShip Takeover • ${timestamp}`, 10, tPageHeight - 4);
        tRemainingHeight -= tPageHeight;
        tY -= tPageHeight;
      }
      tasksPdf.save(
        `vessel_${selectedVessel?.name || "report"}_${new Date().toISOString().slice(0, 10)}_tasks.pdf`
      );
      tasksCon.remove();
    } else if (activeTab === "endpoints") {
      // --- ENDPOINTS PDF ---
      const endpointsCon = document.createElement("div");
      endpointsCon.style.padding = "20px";
      endpointsCon.style.background = "#fff";
      endpointsCon.style.width = "2000px";
      endpointsCon.style.maxWidth = "2000px";
      endpointsCon.style.overflow = "visible";
      endpointsCon.style.margin = "0 auto";
      endpointsCon.classList.add("print-mode");
      // Clone endpoint section
      const endpointPanel = document.querySelector(".endpoint-section");
      if (endpointPanel) {
        const clonedEndpoints = endpointPanel.cloneNode(true);
        // Make sure table container is wide enough and overflow visible
        const tableWrapper = clonedEndpoints.querySelector(".endpoint-table-wrapper");
        if (tableWrapper) {
          tableWrapper.style.width = "auto";
          tableWrapper.style.overflow = "visible";
        }
        const table = clonedEndpoints.querySelector("table.endpoint-table");
        if (table) {
          table.style.width = "auto";
        }
        const header = document.createElement("h2");
        header.innerText = "Endpoint Checklist";
        header.style.margin = "30px 0 16px";
        endpointsCon.appendChild(header);
        endpointsCon.appendChild(clonedEndpoints);
      }
      document.body.appendChild(endpointsCon);
      const endpointsCanvas = await html2canvas(endpointsCon, {
        scale: 2,
        useCORS: true,
        scrollY: -window.scrollY,
        scrollX: -window.scrollX,
        backgroundColor: "#fff"
      });
      const endpointsImgData = endpointsCanvas.toDataURL("image/png");
      const endpointsPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const ePageWidth = endpointsPdf.internal.pageSize.getWidth();
      const ePageHeight = endpointsPdf.internal.pageSize.getHeight();
      const eImgProps = endpointsPdf.getImageProperties(endpointsImgData);
      const eImgHeight = (eImgProps.height * ePageWidth) / eImgProps.width;
      let eRemainingHeight = eImgHeight;
      let eY = 0;
      endpointsPdf.addImage(endpointsImgData, "PNG", 0, 0, ePageWidth, eImgHeight);
      endpointsPdf.setFontSize(6);
      endpointsPdf.setTextColor(100);
      endpointsPdf.text(`Downloaded from iShip Takeover • ${timestamp}`, 10, ePageHeight - 4);
      eRemainingHeight -= ePageHeight;
      eY -= ePageHeight;
      while (eRemainingHeight > 0) {
        endpointsPdf.addPage();
        endpointsPdf.addImage(endpointsImgData, "PNG", 0, eY, ePageWidth, eImgHeight);
        endpointsPdf.setFontSize(6);
        endpointsPdf.setTextColor(100);
        endpointsPdf.text(`Downloaded from iShip Takeover • ${timestamp}`, 10, ePageHeight - 4);
        eRemainingHeight -= ePageHeight;
        eY -= ePageHeight;
      }
      endpointsPdf.save(
        `vessel_${selectedVessel?.name || "report"}_${new Date().toISOString().slice(0, 10)}_endpoints.pdf`
      );
      endpointsCon.remove();
    } else if (activeTab === "activity") {
      // --- ACTIVITY LOG PDF ---
      const activityCon = document.createElement("div");
      activityCon.style.padding = "20px";
      activityCon.style.background = "#fff";
      activityCon.style.width = "1600px";
      activityCon.style.maxWidth = "1600px";
      activityCon.style.overflow = "visible";
      activityCon.style.margin = "0 auto";
      activityCon.classList.add("print-mode");
      // Clone activity log section
      let logPanel = document.querySelector(".log-column.full-width") || document.querySelector(".log-column");
      if (logPanel) {
        const clonedLog = logPanel.cloneNode(true);
        const header = document.createElement("h2");
        header.innerText = "Activity Log";
        header.style.margin = "30px 0 16px";
        activityCon.appendChild(header);
        activityCon.appendChild(clonedLog);
      }
      document.body.appendChild(activityCon);
      const activityCanvas = await html2canvas(activityCon, {
        scale: 2,
        useCORS: true,
        scrollY: -window.scrollY,
        scrollX: -window.scrollX,
        backgroundColor: "#fff"
      });
      const activityImgData = activityCanvas.toDataURL("image/png");
      const activityPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const aPageWidth = activityPdf.internal.pageSize.getWidth();
      const aPageHeight = activityPdf.internal.pageSize.getHeight();
      const aImgProps = activityPdf.getImageProperties(activityImgData);
      const aImgHeight = (aImgProps.height * aPageWidth) / aImgProps.width;
      let aRemainingHeight = aImgHeight;
      let aY = 0;
      activityPdf.addImage(activityImgData, "PNG", 0, 0, aPageWidth, aImgHeight);
      activityPdf.setFontSize(6);
      activityPdf.setTextColor(100);
      activityPdf.text(`Downloaded from iShip Takeover • ${timestamp}`, 10, aPageHeight - 4);
      aRemainingHeight -= aPageHeight;
      aY -= aPageHeight;
      while (aRemainingHeight > 0) {
        activityPdf.addPage();
        activityPdf.addImage(activityImgData, "PNG", 0, aY, aPageWidth, aImgHeight);
        activityPdf.setFontSize(6);
        activityPdf.setTextColor(100);
        activityPdf.text(`Downloaded from iShip Takeover • ${timestamp}`, 10, aPageHeight - 4);
        aRemainingHeight -= aPageHeight;
        aY -= aPageHeight;
      }
      activityPdf.save(
        `vessel_${selectedVessel?.name || "report"}_${new Date().toISOString().slice(0, 10)}_activity.pdf`
      );
      activityCon.remove();
    }
  };

  const groupedTasks = useMemo(() => {
    const groups = {};
    vesselTasks.forEach((t) => {
      const key = t.group || "General";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [vesselTasks]);

  return (
    <div className="app-shell">
      {/* Passcode Modal */}
      {showPasscodeModal && (
        <div className="passcode-overlay">
          <div className="passcode-card">
            <h2>Engineer Access</h2>
            <input
              type="password"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              placeholder="Enter Passcode"
              className="passcode-input"
            />
            <button onClick={handlePasscodeSubmit} className="passcode-submit">Unlock</button>
            <button
              onClick={() => {
                setShowPasscodeModal(false);
                setPasscode("");
              }}
              className="passcode-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <header className="top-bar">
        <div>
          <h1 style={{ color: "#2c587c" }}>
            <img src="/logo.png" alt="Logo" style={{ height: "22px", marginRight: "8px", verticalAlign: "middle" }} />
            iShip × OneSea Vessel Takeover
          </h1>
          <p className="subtitle">
            Live checklist, timers, comments, screenshots &amp; audit trail.
          </p>
        </div>
        <div className="top-right">
          <div className="role-toggle">
            <button
              className={role === "engineer" ? "active" : ""}
              onClick={() => {
                setShowPasscodeModal(true);
              }}
            >
              Engineer
            </button>
            <button
              className={role === "client" ? "active" : ""}
              onClick={() => setRole("client")}
            >
              Client
            </button>
          </div>
          <button className="export-btn" onClick={handleExportPDF}>
            📄 Export PDF
          </button>
        </div>
      </header>

      <div className={`layout ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
        {/* Left: Vessel list */}
        {sidebarOpen && (
          <aside className="vessel-list open">
            <div className="vessel-list-header">
              <div className="vessel-header-left">
                <h2>Vessels</h2>
              </div>
              <div className="vessel-header-actions">
                <button className="add-vessel-mini" onClick={handleAddVessel}>＋</button>
                <button className="sidebar-collapse-btn" onClick={() => setSidebarOpen(false)}>⇤</button>
              </div>
            </div>
            <div className="vessel-list-body with-top-gap extra-top-padding" style={{ paddingTop: "14px" }}>
              {vessels.map((v) => {
                const vTasks = tasks.filter((t) => t.vesselId === v.id);
                const done = vTasks.filter((t) => t.status === "done").length;
                const total = vTasks.length || 1;
                const pct = Math.round((done / total) * 100);
                return (
                  <div
                    key={v.id}
                    className={
                      "vessel-card" + (v.id === selectedVesselId ? " active" : "")
                    }
                    onClick={() => setSelectedVesselId(v.id)}
                  >
                    <div className="vessel-title">{v.name}</div>
                    <div className="vessel-meta">
                      <span>{v.imo || "No IMO"}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="vessel-progress">
                      <div
                        className="vessel-progress-bar"
                        style={{ width: pct + "%" }}
                      />
                    </div>
                  </div>
                );
              })}
              {vessels.length === 0 && (
                <p className="empty-state">No vessels yet. Add one.</p>
              )}
            </div>
          </aside>
        )}

        {/* Toggle button when sidebar closed */}
        {!sidebarOpen && (
          <button className="sidebar-toggle-floating" onClick={() => setSidebarOpen(true)}>
            ☰
          </button>
        )}

        {/* Right: Main panel */}
        <main className="main-panel">
          {selectedVessel ? (
            <>
              <div className="vessel-header">
                <div>
                  <h2>{selectedVessel.name}</h2>
                  <p className="vessel-subtitle">
                    IMO: {selectedVessel.imo || "N/A"}
                  </p>
                </div>
                <div className="vessel-header-right">
                  <div className="chip">
                    Tasks: {summary.total} • Done: {summary.done} • In Progress:{" "}
                    {summary.inProgress} • Delayed: {summary.delayed}
                  </div>
                  <div className="chip muted">
                    Total Elapsed: {formatTime(summary.elapsedTotal)}
                  </div>
                </div>
              </div>

              <div className="tab-strip">
                <button
                  className={`tab-btn ${activeTab === "tasks" ? "active" : ""}`}
                  onClick={() => setActiveTab("tasks")}
                >
                  Tasks
                </button>
                <button
                  className={`tab-btn ${activeTab === "endpoints" ? "active" : ""}`}
                  onClick={() => setActiveTab("endpoints")}
                >
                  Endpoint Checklist
                </button>
                <button
                  className={`tab-btn ${activeTab === "activity" ? "active" : ""}`}
                  onClick={() => setActiveTab("activity")}
                >
                  Activity Log
                </button>
              </div>

              {activeTab === "tasks" && (
                <div className="single-column">
                  <section className="tasks-column">
                    <DragDropContext onDragEnd={onDragEnd}>
                      <Droppable
                        droppableId="tasks-droppable"
                        direction="vertical"
                      >
                        {(provided) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                          >
                            {Object.entries(groupedTasks).map(
                              ([groupName, groupTasks]) => (
                                <div
                                  key={groupName}
                                  className="group-block pdf-section"
                                  style={{
                                    "--group-color": GROUP_COLORS[groupName] || "#9ca3af",
                                    breakInside: "avoid-page",
                                    pageBreakInside: "avoid",
                                    paddingTop: "24px"
                                  }}
                                >
                                  <div className="group-header">
                                    <span
                                      className={
                                        "group-dot " +
                                        (GROUP_COLORS[groupName] || "gray")
                                      }
                                    />
                                    <h3>{groupName}</h3>
                                  </div>

                                  {groupTasks.map((task) => {
                                    const globalIndex =
                                      vesselTasks.findIndex(
                                        (t) => t.id === task.id
                                      );
                                    const elapsed = task.elapsed_seconds || 0;
                                    const deadline =
                                      task.deadline_seconds || 3600;
                                    const pct = Math.min(
                                      100,
                                      Math.round((elapsed / deadline) * 100)
                                    );
                                    const delayed = elapsed > deadline;

                                    return (
                                      <Draggable
                                        key={task.id}
                                        draggableId={String(task.id)}
                                        index={globalIndex}
                                        isDragDisabled={role !== "engineer"}
                                      >
                                        {(provided) => (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                          >
                                            <div className="pdf-section">
                                              <div
                                                className="task-card"
                                                style={{
                                                  breakInside: "avoid-page",
                                                  pageBreakInside: "avoid"
                                                }}
                                              >
                                                <div className="task-top-row">
                                                  <div className="task-main-title">
                                                    {role === "engineer" && (
                                                      <span
                                                        className="drag-icon"
                                                        {...provided.dragHandleProps}
                                                      >
                                                        ⠿
                                                      </span>
                                                    )}
                                                    <span>{task.title}</span>
                                                  </div>
                                                  <div className="task-status-wrap">
                                                    <span
                                                      className={
                                                        "status-pill " +
                                                        (task.status === "done"
                                                          ? "done"
                                                          : task.status ===
                                                            "in_progress"
                                                          ? "progress"
                                                          : "pending")
                                                      }
                                                    >
                                                      {task.status ===
                                                      "in_progress"
                                                        ? "In Progress"
                                                        : task.status === "done"
                                                        ? "Done"
                                                        : "Not Started Yet"}
                                                    </span>
                                                    {role === "engineer" && (
                                                      <button
                                                        className="icon-btn delete"
                                                        onClick={() =>
                                                          handleDeleteTask(task.id)
                                                        }
                                                      >
                                                        🗑️
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>

                                                <div className="timeline-row">
                                                  <div className="timeline-meta">
                                                    <span>
                                                      Deadline: {Math.round(
                                                        deadline / 60
                                                      )} min
                                                    </span>
                                                    <span>
                                                      Elapsed: {formatTime(elapsed)}
                                                    </span>
                                                    {task.status ===
                                                      "in_progress" ||
                                                    task.status === "done" ? (
                                                      <span
                                                        className={
                                                          "time-flag " +
                                                          (delayed
                                                            ? "delayed"
                                                            : "under")
                                                        }
                                                      >
                                                        {delayed
                                                          ? "⚠ Delayed"
                                                          : "✅ Under Time"}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                  <div className="timeline-bar">
                                                    <div
                                                      className={
                                                        "timeline-fill " +
                                                        (delayed
                                                          ? "delayed"
                                                          : "ok")
                                                      }
                                                      style={{ width: pct + "%" }}
                                                    />
                                                  </div>
                                                </div>

                                                <div className="attachments-row">
                                                  <div className="attachments-list">
                                                    {task.attachments &&
                                                      task.attachments.map(
                                                        (att, idx) => (
                                                          <div
                                                            key={idx}
                                                            className="thumb-preview"
                                                            onClick={() =>
                                                              setPreviewImage(
                                                                "https://onboard-x570.onrender.com" +
                                                                  att.url
                                                              )
                                                            }
                                                          >
                                                            <img
                                                              src={
                                                                "https://onboard-x570.onrender.com" +
                                                                att.url
                                                              }
                                                              alt={att.originalName}
                                                              className="thumb-img"
                                                            />
                                                          </div>
                                                        )
                                                      )}
                                                    {task.attachments?.length ===
                                                      0 && (
                                                      <span className="muted">
                                                        No screenshots yet
                                                      </span>
                                                    )}
                                                  </div>
                                                  {role === "engineer" && (
                                                    <label className="upload-btn">
                                                      {uploadingTaskId === task.id
                                                        ? "Uploading..."
                                                        : "Upload Screenshot"}
                                                      <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) =>
                                                          handleUpload(
                                                            task.id,
                                                            e.target.files[0]
                                                          )
                                                        }
                                                      />
                                                    </label>
                                                  )}
                                                </div>

                                                <div className="task-footer-row">
                                                  <div className="comments-info">
                                                    <span>
                                                      💬{" "}
                                                      {task.comments?.length ||
                                                        0}{" "}
                                                      comments
                                                    </span>
                                                    {task.comments &&
                                                      task.comments[0] && (
                                                        <span className="muted">
                                                          Last:{" "}
                                                          {formatTS(
                                                            task.comments[
                                                              task.comments.length -
                                                                1
                                                            ].timestamp
                                                          )}
                                                        </span>
                                                      )}
                                                  </div>
                                                  <div className="task-btns">
                                                    {role === "engineer" && (
                                                      <>
                                                        {task.status ===
                                                          "pending" && (
                                                          <button
                                                            className="pill-btn start"
                                                            onClick={() =>
                                                              handleStartTask(
                                                                task.id
                                                              )
                                                            }
                                                          >
                                                            ▶ Start
                                                          </button>
                                                        )}

                                                        {task.status ===
                                                          "in_progress" && (
                                                          <button
                                                            className="pill-btn done"
                                                            onClick={() =>
                                                              handleDoneTask(
                                                                task.id
                                                              )
                                                            }
                                                          >
                                                            ✔ Done
                                                          </button>
                                                        )}
                                                      </>
                                                    )}
                                                    <button
                                                      className="pill-btn ghost"
                                                      onClick={() =>
                                                        handleSaveComment(
                                                          task.id
                                                        )
                                                      }
                                                    >
                                                      + Comment
                                                    </button>
                                                  </div>
                                                </div>
                                                {task.comments &&
                                                  task.comments.length > 0 && (
                                                    <div className="comment-thread refined compact">
                                                      <div
                                                        className="comment-toggle premium-toggle"
                                                        onClick={() =>
                                                          toggleComments(task.id)
                                                        }
                                                      >
                                                        💬{" "}
                                                        {task.comments.length}{" "}
                                                        Comments
                                                        <span className="toggle-arrow small-arrow">
                                                          {collapsedComments[
                                                            task.id
                                                          ]
                                                            ? "▼"
                                                            : "▲"}
                                                        </span>
                                                      </div>

                                                      {!collapsedComments[
                                                        task.id
                                                      ] && (
                                                        <div className="comment-body small-text">
                                                          {task.comments
                                                            .filter(
                                                              (c) => !c.parentId
                                                            )
                                                            .map((root) => (
                                                              <div
                                                                key={root.id}
                                                                className="comment-item refined"
                                                              >
                                                                <p className="comment-text tiny-text">
                                                                  <strong>
                                                                    {root.role}:
                                                                  </strong>{" "}
                                                                  {root.text}
                                                                </p>
                                                                <span className="comment-time micro">
                                                                  {formatTS(
                                                                    root.timestamp
                                                                  )}
                                                                </span>
                                                                <div className="comment-replies">
                                                                  {task.comments
                                                                    .filter(
                                                                      (r) =>
                                                                        r.parentId ===
                                                                        root.id
                                                                    )
                                                                    .map(
                                                                      (reply) => (
                                                                        <div
                                                                          key={
                                                                            reply.id
                                                                          }
                                                                          className="comment-reply compact small-text"
                                                                        >
                                                                          <p className="comment-text tiny-text">
                                                                            <strong>
                                                                              {
                                                                                reply.role
                                                                              }
                                                                              :
                                                                            </strong>{" "}
                                                                            {
                                                                              reply.text
                                                                            }
                                                                          </p>
                                                                          <span className="comment-time micro">
                                                                            {formatTS(
                                                                              reply.timestamp
                                                                            )}
                                                                          </span>
                                                                        </div>
                                                                      )
                                                                    )}
                                                                </div>
                                                              </div>
                                                            ))}
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </Draggable>
                                    );
                                  })}
                                </div>
                              )
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  </section>
                </div>
              )}

              {activeTab === "endpoints" && (
                <div className="single-column">
                  <section className="endpoint-section">
                    <div className="endpoint-timer-bar">
                      <div className="et-left">
                        <strong>Elapsed:</strong> {formatTime(selectedVessel?.endpointElapsedSeconds || 0)}
                        <strong style={{ marginLeft: "16px" }}>Per Endpoint:</strong>{" "}
                        {formatTime(Math.floor((selectedVessel?.endpointElapsedSeconds || 0) / 11))}
                        <span style={{ marginLeft: "16px" }} className="muted small">
                          Deadline: 30 min each endpoint
                        </span>
                      </div>
                      {role === "engineer" && (
                        <div className="et-right">
                          {!selectedVessel?.endpointTimerStart || selectedVessel?.endpointTimerEnd ? (
                            <button
                              className="pill-btn start"
                              onClick={async () => {
                                await fetch(`https://onboard-x570.onrender.com/api/vessels/${selectedVesselId}/endpoint-timer/start`, {
                                  method: "POST",
                                  headers: { "X-API-KEY": "secret-engineer-key" }
                                });
                              }}
                            >
                              ▶ Start Timer
                            </button>
                          ) : (
                            <button
                              className="pill-btn done"
                              onClick={async () => {
                                await fetch(`https://onboard-x570.onrender.com/api/vessels/${selectedVesselId}/endpoint-timer/stop`, {
                                  method: "POST",
                                  headers: { "X-API-KEY": "secret-engineer-key" }
                                });
                              }}
                            >
                              ⏹ Stop Timer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="endpoint-header">
                      <h3>Endpoint Configuration Checklist</h3>
                      <p className="muted small">
                        Tap a cell to cycle status: Pending → Done → N/A
                      </p>
                    </div>
                    {vesselEndpoints.length === 0 ? (
                      <p className="muted">
                        No endpoints configured for this vessel yet.
                      </p>
                    ) : (
                      <div className="endpoint-table-wrapper">
                        <table className="endpoint-table">
                          <thead>
                            <tr>
                              <th>Endpoint</th>
                              {Object.keys(
                                vesselEndpoints[0].fields || {}
                              ).map((fieldKey) => (
                                <th key={fieldKey}>
                                  {ENDPOINT_FIELD_LABELS[fieldKey] ||
                                    fieldKey}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {vesselEndpoints.map((ep) => {
                              const fieldKeys = Object.keys(ep.fields || {});
                              return (
                                <tr key={ep.id}>
                                  <td className="endpoint-label">{ep.label}</td>
                                  {fieldKeys.map((fieldKey) => {
                                    const val =
                                      ep.fields?.[fieldKey] || "pending";
                                    return (
                                      <td
                                        key={fieldKey}
                                        className={
                                          "endpoint-cell status-" +
                                          val +
                                          (role === "engineer"
                                            ? " clickable"
                                            : "")
                                        }
                                        onClick={
                                          role === "engineer"
                                            ? () =>
                                                handleEndpointFieldChange(
                                                  ep.id,
                                                  fieldKey
                                                )
                                            : undefined
                                        }
                                      >
                                        {val === "done"
                                          ? "✔"
                                          : val === "na"
                                          ? "N/A"
                                          : "•"}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {activeTab === "activity" && (
                <div className="single-column">
                  <section className="log-column full-width">
                    <h3>Activity Log</h3>
                    <div className="log-list">
                      {vesselLogs.length === 0 && (
                        <p className="muted">No activity yet.</p>
                      )}
                      {vesselLogs.map((log) => (
                        <div key={log.id} className="log-item">
                          <div className="log-time">
                            {formatTS(log.timestamp)}
                          </div>
                          <div className="log-message">{log.message}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </>
          ) : (
            <p className="empty-state">
              Select a vessel from the left or add one.
            </p>
          )}
        </main>
      </div>

      {/* Bottom sticky summary bar */}
      {selectedVessel && (
        <div
          className={sidebarOpen ? "bottom-summary" : "bottom-summary full"}
          style={!sidebarOpen ? { width: "100%", left: 0, right: 0 } : {}}
        >
          <span>
            Tasks: <strong>{summary.total}</strong>
          </span>
          <span>
            Done: <strong>{summary.done}</strong>
          </span>
          <span>
            In Progress: <strong>{summary.inProgress}</strong>
          </span>
          <span>
            Delayed: <strong>{summary.delayed}</strong>
          </span>
          <span>
            Remaining: <strong>{summary.remaining}</strong>
          </span>
          <span>
            Total Elapsed: <strong>{formatTime(summary.elapsedTotal)}</strong>
          </span>
          {role === "engineer" && (
            <button className="floating-add-task" onClick={handleAddTask}>
              + Add Task
            </button>
          )}
        </div>
      )}
    {previewImage && (
      <div className="img-modal" onClick={() => setPreviewImage(null)}>
        <img src={previewImage} className="modal-img" />
      </div>
    )}
    </div>
  );
}