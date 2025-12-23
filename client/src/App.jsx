import React, {useEffect, useState, useMemo} from "react";
import {io} from "socket.io-client";
import {DragDropContext, Droppable, Draggable} from "@hello-pangea/dnd";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "./App.css";

const BASE_URL = import.meta.env.VITE_API_URL || "";


const socket = io(BASE_URL || window.location.origin, {autoConnect: true});

const formatTime = (sec = 0) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h > 0 ? h + "h " : ""}${m > 0 ? m + "m " : ""}${s}s`;
};

const formatTS = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleString([], {
        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric"
    });
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
    const [snapshot, setSnapshot] = useState({vessels: [], tasks: [], logs: []});
    const [selectedVesselId, setSelectedVesselId] = useState(null);


// auth: { token, role, name } or null
    const [auth, setAuth] = useState(() => {
        try {
            if (typeof window === "undefined") return null;
            const raw = localStorage.getItem("onboard_auth");
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn("Failed to read stored session", e);
            return null;
        }
    });

    const [loginPassword, setLoginPassword] = useState("");
    const [loginRole, setLoginRole] = useState("Admin"); // Admin | Onboard Eng | Remote Team | Client
    const [loginError, setLoginError] = useState("");
    const [uploadingTaskId, setUploadingTaskId] = useState(null);
    const [collapsedComments, setCollapsedComments] = useState({});
    const [previewImage, setPreviewImage] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState("tasks"); // tasks | endpoints | activity | whatsapp
    
    const [whatsappStatus, setWhatsappStatus] = useState(null);
    const [whatsappQr, setWhatsappQr] = useState(null);
    const [whatsappGroups, setWhatsappGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState("");
    
    const toggleComments = (taskId) => {
        setCollapsedComments(prev => ({
            ...prev, [taskId]: !prev[taskId]
        }));
    };

    const isEngineer = auth?.role === "Admin" || auth?.role === "Onboard Eng";
    const isRemote = auth?.role === "Remote Team";
    const isClient = auth?.role === "Client";

    const handleLogin = async () => {
        setLoginError("");
        if (!loginPassword) return;
        try {
            const res = await fetch(`${BASE_URL}/api/auth/login`, {
                method: "POST", headers: {
                    "Content-Type": "application/json"
                }, body: JSON.stringify({password: loginPassword})
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setLoginError(data.error || "Invalid password");
                return;
            }

            const data = await res.json();
            setAuth({
                token: data.token, role: data.user.role, name: data.user.name, id: data.user.id
            });
            setLoginPassword("");
        } catch (err) {
            setLoginError("Network error while logging in");
        }
    };

    useEffect(() => {
        try {
            if (typeof window === "undefined") return;

            if (auth) {
                localStorage.setItem("onboard_auth", JSON.stringify(auth));
            } else {
                localStorage.removeItem("onboard_auth");
            }
        } catch (e) {
            console.warn("Failed to persist session", e);
        }
    }, [auth]);


    const handleLogout = () => {
        setAuth(null);                  // React state clear
        try {
            if (typeof window !== "undefined") {
                localStorage.removeItem("onboard_auth"); // storage clear
            }
        } catch (e) {
            console.warn("Failed to clear session", e);
        }
    };

    const fetchWhatsAppStatus = async () => {
        if (!auth?.token) return;
        try {
            const res = await fetch(`${BASE_URL}/api/whatsapp/status`, {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setWhatsappStatus(data);
            }
        } catch (err) {
            console.error("Failed to fetch WhatsApp status:", err);
        }
    };

    const fetchWhatsAppQr = async () => {
        if (!auth?.token) return;
        try {
            const res = await fetch(`${BASE_URL}/api/whatsapp/qr`, {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setWhatsappQr(data.qrCode);
            }
        } catch (err) {
            console.error("Failed to fetch WhatsApp QR:", err);
        }
    };

    const fetchWhatsAppGroups = async () => {
        if (!auth?.token) return;
        try {
            const res = await fetch(`${BASE_URL}/api/whatsapp/groups`, {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setWhatsappGroups(data.groups || []);
            }
        } catch (err) {
            console.error("Failed to fetch WhatsApp groups:", err);
        }
    };

    const initWhatsApp = async () => {
        if (!auth?.token) return;
        try {
            await fetch(`${BASE_URL}/api/whatsapp/init`, {
                method: "POST",
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            setTimeout(fetchWhatsAppStatus, 2000);
            setTimeout(fetchWhatsAppQr, 3000);
        } catch (err) {
            console.error("Failed to init WhatsApp:", err);
        }
    };

    const setWhatsAppGroup = async (groupId) => {
        if (!auth?.token || !groupId) return;
        try {
            await fetch(`${BASE_URL}/api/whatsapp/set-group`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${auth.token}`
                },
                body: JSON.stringify({ groupId })
            });
            setSelectedGroupId(groupId);
            alert("WhatsApp group set successfully!");
        } catch (err) {
            console.error("Failed to set WhatsApp group:", err);
        }
    };

    useEffect(() => {
        if (activeTab === "whatsapp" && auth?.role === "Admin") {
            fetchWhatsAppStatus();
            fetchWhatsAppQr();
        }
    }, [activeTab, auth]);

    function toTitleCase(str) {
        return str.toLowerCase().replace(/\b\w/g, function (char) {
            return char.toUpperCase();
        });
    }


    // Passcode modal submit handler
    // const handlePasscodeSubmit = () => {
    //     if (passcode === "220322") {
    //         setEngineerAuthenticated(true);
    //         setRole("engineer");
    //         setPasscode("");
    //     } else {
    //         // Optionally: add shake animation here via CSS class
    //     }
    // };
    useEffect(() => {
        socket.on("snapshot", (data) => {
            setSnapshot(data);

            const currentId = selectedVesselId;
            const list = data.vessels || [];

            if (!currentId && list.length) {
                setSelectedVesselId(list[0].id);
            } else if (currentId && !list.find(v => v.id === currentId)) {
                // previously selected vessel no longer exists
                setSelectedVesselId(list[0]?.id || null);
            }
        });

        return () => socket.off("snapshot");
    }, [selectedVesselId]);

    const vessels = snapshot.vessels || [];
    const tasks = snapshot.tasks || [];
    const logs = snapshot.logs || [];
    console.log("=====")
    console.log(snapshot.endpoints || [])
    const endpoints = snapshot.endpoints || [];

    const isAssignedToTask = function (task) {
        console.log(auth)
        console.log(task)

        return auth?.id === task.assignedTo
    }
    const isAdminOrEngineer = auth?.role === "Admin" || auth?.role === "Onboard Eng";

    const selectedVessel = useMemo(() => vessels.find((v) => v.id === selectedVesselId) || null, [vessels, selectedVesselId]);

    const vesselTasks = useMemo(() => tasks.filter((t) => t.vesselId === selectedVesselId), [tasks, selectedVesselId]);

    const vesselLogs = useMemo(() => logs.filter((l) => l.vesselId === selectedVesselId).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [logs, selectedVesselId]);

    const vesselEndpoints = useMemo(() => endpoints.filter((e) => e.vesselId === selectedVesselId), [endpoints, selectedVesselId]);

    const totalEndpointElapsed = useMemo(() => {
        if (!vesselEndpoints.length) return 0;

        return Math.max(
            ...vesselEndpoints.map(ep => ep.elapsedSeconds || 0),
            0
        );
    }, [vesselEndpoints]);

    const avgEndpointElapsed = useMemo(() => vesselEndpoints.length ? Math.floor(totalEndpointElapsed / vesselEndpoints.length) : 0, [totalEndpointElapsed, vesselEndpoints.length]);


    const cycleEndpointStatus = (val) => {
        if (val === "done") return "na";
        if (val === "na") return "pending";
        return "done";
    };

    const handleEndpointFieldChange = async (endpointId, field, assignedTo) => {
        // if (!isEngineer) return;
        if (!(auth.id === assignedTo.id)) return;
        const ep = vesselEndpoints.find((e) => e.id === endpointId);
        const current = (ep && ep.fields && ep.fields[field]) || "pending";
        const next = cycleEndpointStatus(current);
        await fetch(`${BASE_URL}/api/endpoints/${endpointId}/field`, {
            method: "POST", headers: {
                "Content-Type": "application/json", ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            }, body: JSON.stringify({field, value: next})
        });
    };

    const handleEndpointTimerAction = async (endpointId, action) => {
        if (isClient) return;
        await fetch(`${BASE_URL}/api/endpoints/${endpointId}/${action}`, {
            method: "POST", headers: {
                "Content-Type": "application/json", ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            },
        });
    };

    const handleEndpointStart = (endpointId) => handleEndpointTimerAction(endpointId, "start");

    const handleEndpointPause = (endpointId) => handleEndpointTimerAction(endpointId, "pause");

    const handleEndpointDone = (endpointId) => handleEndpointTimerAction(endpointId, "done");

    const summary = useMemo(() => {
        const total = vesselTasks.length;
        const done = vesselTasks.filter((t) => t.status === "done").length;
        const inProgress = vesselTasks.filter((t) => t.status === "in_progress").length;
        const delayed = vesselTasks.filter((t) => (t.elapsed_seconds || 0) > (t.deadline_seconds || 3600)).length;
        const remaining = total - done;
        const elapsedTotal = Math.max(...vesselTasks.map(t => t.elapsed_seconds || 0), 0);
        return {total, done, inProgress, delayed, remaining, elapsedTotal};
    }, [vesselTasks]);

    const handleAddVessel = async () => {
        if (!isEngineer) return;
        const name = window.prompt("Vessel name:");
        if (!name) return;
        const imo = window.prompt("IMO number (optional):") || "";
        await fetch(`${BASE_URL}/api/vessels`, {
            method: "POST", headers: {
                "Content-Type": "application/json", ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            }, body: JSON.stringify({name, imo})
        });
    };

    const handleDeleteVessel = async (vesselId) => {
        if (!isAdminOrEngineer) return;

        const vessel = vessels.find(v => v.id === vesselId);
        const name = vessel ? vessel.name : "";

        if (!window.confirm(`Delete vessel "${name}" and all its tasks, endpoints and logs?`)) {
            return;
        }

        await fetch(`${BASE_URL}/api/vessels/${vesselId}`, {
            method: "DELETE",
            headers: {
                ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            }
        });

        // If the deleted vessel was selected, clear selection.
        if (selectedVesselId === vesselId) {
            setSelectedVesselId(null);
        }
    };

    const handleRenameVessel = async (vesselId, currentName) => {
        if (!isAdminOrEngineer) return;

        const newName = window.prompt("Edit vessel name:", currentName || "");
        if (!newName) return;

        const trimmed = newName.trim();
        if (!trimmed || trimmed === currentName) return;

        await fetch(`${BASE_URL}/api/vessels/${vesselId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            },
            body: JSON.stringify({name: trimmed})
        });
    };

    const canControlEndpoint = (endpoint) => {
        if (!auth) return false;
        // Admin full control
        if (auth.role === "Admin") return true;

        // If no assignee, only admin can control
        if (!endpoint.assignedTo) return false;

        // Only the assigned user can control
        return Number(endpoint.assignedTo) === auth.id;
    };


    const handleAssignEndpoint = async (endpointId, userId) => {
        if (!auth) return;

        try {
            await fetch(`${BASE_URL}/api/endpoints/${endpointId}/assign`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${auth.token}`,
                },
                body: JSON.stringify({userId}),
            });
            // No need to update local state manually, snapshot from socket will refresh
        } catch (err) {
            console.error("Failed to assign endpoint", err);
            alert("Failed to assign endpoint");
        }
    };


    const handleAddTask = async () => {
        if ((isEngineer || isRemote) && selectedVesselId) {
            const title = window.prompt("Task title:");
            if (!title) return;
            const group = window.prompt("Task group: Network Setup / Email & Communication / Software Installations / Server Setup / Verification & Handover / General") || "General";
            await fetch(`${BASE_URL}/api/vessels/${selectedVesselId}/tasks`, {
                method: "POST", headers: {
                    "Content-Type": "application/json", ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
                }, body: JSON.stringify({title, group})
            });
        }

    };

    const handleAssign = async (taskId, userId) => {
        await fetch(`${BASE_URL}/api/tasks/${taskId}/assign`, {
            method: "POST", headers: {
                "Content-Type": "application/json", Authorization: `Bearer ${auth.token}`
            }, body: JSON.stringify({userId: Number(userId)})
        });
    };

    const handleStartTask = async (taskId, task) => {
        if (!auth) return;

        // Same rule as backend
        if (!isAssignedToTask(task) && !isAdminOrEngineer) {
            alert("You are not allowed to start this task");
            return;
        }

        await fetch(`${BASE_URL}/api/tasks/${taskId}/start`, {
            method: "POST",
            headers: {
                ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
            }
        });
    };

    const handlePauseTask = async (taskId, task) => {
        if (!auth) return;

        handleSaveComment(taskId);

        if (!isAssignedToTask(task) && !isAdminOrEngineer) {
            alert("You are not allowed to pause this task");
            return;
        }

        await fetch(`${BASE_URL}/api/tasks/${taskId}/pause`, {
            method: "POST",
            headers: {
                ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
            }
        });
    };

    const handleDoneTask = async (taskId, task) => {
        if (!auth) return;

        if (!isAssignedToTask(task) && !isAdminOrEngineer) {
            alert("You are not allowed to complete this task");
            return;
        }

        await fetch(`${BASE_URL}/api/tasks/${taskId}/done`, {
            method: "POST",
            headers: {
                ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
            }
        });
    };


    // const handleStartTask = async (taskId, task) => {
    //     if (isAssignedToTask(task) || !isAdminOrEngineer) {
    //         await fetch(`https://api-onboard.ishipplus.cloud/api/tasks/${taskId}/start`, {
    //             method: "POST", headers: {...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})}
    //         });
    //     }
    // };
    //
    // const handlePauseTask = async (taskId, task) => {
    //     handleSaveComment(taskId)
    //     if (isAssignedToTask(task) || !isAdminOrEngineer) {
    //         await fetch(`https://api-onboard.ishipplus.cloud/api/tasks/${taskId}/pause`, {
    //             method: "POST", headers: {...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})}
    //         });
    //     }
    // };
    //
    // const handleDoneTask = async (taskId, task) => {
    //     if (isAssignedToTask(task) || !isAdminOrEngineer) {
    //         await fetch(`https://api-onboard.ishipplus.cloud/api/tasks/${taskId}/done`, {
    //             method: "POST", headers: {...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})}
    //         });
    //     }
    // };

    const handleDeleteTask = async (taskId) => {
        if (!isEngineer) return;
        if (!window.confirm("Remove this task?")) return;
        await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
            method: "DELETE", headers: {...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})}
        });
    };

    const handleSaveComment = async (taskId, parentId = null) => {
        const comment = window.prompt("Enter comment:");
        if (!comment) return;

        await fetch(`${BASE_URL}/api/tasks/${taskId}/comment`, {
            method: "POST", headers: {
                "Content-Type": "application/json", ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            }, // backend should now read role from JWT (req.user.role),
            // so no need to send role from frontend
            body: JSON.stringify({comment, parentId})
        });
    };


    const handleEditComment = async (commentId) => {
        if (!isAdminOrEngineer) return;
        const newText = window.prompt("Edit comment:");
        if (!newText) return;
        await fetch(`${BASE_URL}/api/comment/${commentId}`, {
            method: "PUT", headers: {
                "Content-Type": "application/json", ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            }, body: JSON.stringify({comment: newText})
        });
    };

    const handleDeleteComment = async (commentId) => {
        if (!isAdminOrEngineer) return;
        if (!window.confirm("Delete this comment & all replies?")) return;
        await fetch(`${BASE_URL}/api/comment/${commentId}`, {
            method: "DELETE", headers: {
                ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            }
        });
    };

    const handleUpload = async (taskId, file) => {
        // if (!isEngineer) return;
        if (!file) return;
        setUploadingTaskId(taskId);
        const form = new FormData();
        form.append("file", file);
        await fetch(`${BASE_URL}/api/tasks/${taskId}/upload`, {
            method: "POST", headers: {
                ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            }, body: form
        });
        setUploadingTaskId(null);
    };

    const onDragEnd = async (result) => {
        if (!isEngineer) return;
        if (!result.destination || !selectedVesselId) return;

        const newTasks = Array.from(vesselTasks);
        const [moved] = newTasks.splice(result.source.index, 1);
        newTasks.splice(result.destination.index, 0, moved);

        const order = newTasks.map((t) => t.id);

        await fetch(`${BASE_URL}/api/tasks/reorder`, {
            method: "POST", headers: {
                "Content-Type": "application/json", ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})
            }, body: JSON.stringify({vesselId: selectedVesselId, order})
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
                scale: 2, useCORS: true, scrollY: -window.scrollY, scrollX: -window.scrollX, backgroundColor: "#fff"
            });
            const tasksImgData = tasksCanvas.toDataURL("image/png");
            const tasksPdf = new jsPDF({orientation: "portrait", unit: "mm", format: "a4"});
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
            tasksPdf.save(`vessel_${selectedVessel?.name || "report"}_${new Date().toISOString().slice(0, 10)}_tasks.pdf`);
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
                scale: 2, useCORS: true, scrollY: -window.scrollY, scrollX: -window.scrollX, backgroundColor: "#fff"
            });
            const endpointsImgData = endpointsCanvas.toDataURL("image/png");
            const endpointsPdf = new jsPDF({orientation: "landscape", unit: "mm", format: "a4"});
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
            endpointsPdf.save(`vessel_${selectedVessel?.name || "report"}_${new Date().toISOString().slice(0, 10)}_endpoints.pdf`);
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
                scale: 2, useCORS: true, scrollY: -window.scrollY, scrollX: -window.scrollX, backgroundColor: "#fff"
            });
            const activityImgData = activityCanvas.toDataURL("image/png");
            const activityPdf = new jsPDF({orientation: "portrait", unit: "mm", format: "a4"});
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
            activityPdf.save(`vessel_${selectedVessel?.name || "report"}_${new Date().toISOString().slice(0, 10)}_activity.pdf`);
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

    if (!auth) {
        return (<div className="app-shell login-shell">
            <header className="top-bar">
                <div>
                    <h1 style={{color: "#2c587c"}}>
                        <img
                            src="/logo.png"
                            alt="Logo"
                            style={{height: "22px", marginRight: "8px", verticalAlign: "middle"}}
                        />
                        iShip × OneSea Vessel Takeover
                    </h1>
                    <p className="subtitle">
                        Secure login with role based access.
                    </p>
                </div>
            </header>

            <h2>Select Role & Login</h2>

            <div className="passcode-overlay">
                <div className="passcode-card">
                    <h2>Select Role & Login</h2>
                    <div className="login-role-tabs">
                        {["Admin", "Onboard Eng", "Remote Team", "Client"].map((r) => (
                            <button
                                key={r}
                                type="button"
                                className={
                                    "login-role-tab" + (loginRole === r ? " active" : "")
                                }
                                onClick={() => setLoginRole(r)}
                            >
                                {r === "Onboard Eng"
                                    ? "Onboard Eng"
                                    : r === "Remote Team"
                                        ? "Remote Team"
                                        : r}
                            </button>
                        ))}
                    </div>
                    {/*<h2>Enter your access password</h2>*/}
                    <input
                        type="password"
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        placeholder="Password"
                        className="passcode-input"
                    />
                    {loginError && <p className="login-error">{loginError}</p>}
                    <button className="passcode-submit" onClick={handleLogin}>
                        Login
                    </button>
                </div>
            </div>
        </div>);
    }
    console.log(groupedTasks)

    return (<div className="app-shell">
        {/* Passcode Modal */}
        <header className="top-bar">
            <div>
                <h1 style={{color: "#2c587c"}}>
                    <img src="/logo.png" alt="Logo"
                         style={{height: "22px", marginRight: "8px", verticalAlign: "middle"}}/>
                    iShip × OneSea Vessel Takeover
                </h1>
                <p className="subtitle">
                    Live checklist, timers, comments, screenshots &amp; audit trail.
                </p>
            </div>
            <div className="top-right">
                <div className="top-right">
                    <div className="chip">
                        {auth.name} • {auth.role}
                    </div>
                    <button
                        className="export-btn"
                        onClick={handleExportPDF}
                    >
                        📄 Export PDF
                    </button>
                    <button className="export-btn" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </div>
        </header>

        <div className={`layout ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
            {/* Left: Vessel list */}
            {sidebarOpen && (<aside className="vessel-list open">
                <div className="vessel-list-header">
                    <div className="vessel-header-left">
                        <h2>Vessels</h2>
                    </div>
                    <div className="vessel-header-actions">
                        {isAdminOrEngineer ?
                            <button className="add-vessel-mini" onClick={handleAddVessel}>＋</button> : null}
                        <button className="sidebar-collapse-btn" onClick={() => setSidebarOpen(false)}>⇤
                        </button>
                    </div>
                </div>
                <div className="vessel-list-body with-top-gap extra-top-padding" style={{paddingTop: "14px"}}>
                    {vessels.map((v) => {
                        const vTasks = tasks.filter((t) => t.vesselId === v.id);
                        const done = vTasks.filter((t) => t.status === "done").length;
                        const total = vTasks.length || 1;
                        const pct = Math.round((done / total) * 100);
                        return (<div
                            key={v.id}
                            className={"vessel-card" + (v.id === selectedVesselId ? " active" : "")}
                            onClick={() => setSelectedVesselId(v.id)}
                        >
                            <div className={"vessel-name-container"}>
                                <div className="vessel-title">{v.name}</div>
                                {isAdminOrEngineer && (
                                    <div className="vessel-btn-wrapper">
                                        <button
                                            className="vessel-edit-btn"
                                            title="Rename vessel"
                                            onClick={(e) => {
                                                e.stopPropagation(); // click se vessel select change na ho
                                                handleRenameVessel(v.id, v.name);
                                            }}
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="vessel-delete-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteVessel(v.id);
                                            }}
                                            title="Delete vessel"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="vessel-meta">
                                <span>IMO: {v.imo || "No IMO"}</span>
                                <span>{pct}%</span>
                            </div>
                            <div className="vessel-progress">
                                <div
                                    className="vessel-progress-bar"
                                    style={{width: pct + "%"}}
                                />
                            </div>
                        </div>);
                    })}
                    {vessels.length === 0 && (<p className="empty-state">No vessels yet. Add one.</p>)}
                </div>
            </aside>)}

            {/* Toggle button when sidebar closed */}
            {!sidebarOpen && (<button className="sidebar-toggle-floating" onClick={() => setSidebarOpen(true)}>
                ☰
            </button>)}

            {/* Right: Main panel */}
            <main className="main-panel">
                {selectedVessel ? (<>
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
                        {auth?.role === "Admin" && (
                            <button
                                className={`tab-btn ${activeTab === "whatsapp" ? "active" : ""}`}
                                onClick={() => setActiveTab("whatsapp")}
                            >
                                WhatsApp
                            </button>
                        )}
                    </div>

                    {activeTab === "tasks" && (<div className="single-column">
                        <section className="tasks-column">
                            <DragDropContext onDragEnd={onDragEnd}>
                                <Droppable
                                    droppableId="tasks-droppable"
                                    direction="vertical"
                                >
                                    {(provided) => (<div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                    >
                                        {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (<div
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
                                        className={"group-dot " + (GROUP_COLORS[groupName] || "gray")}
                                    />
                                                <h3>{groupName}</h3>
                                            </div>

                                            {groupTasks.map((task) => {
                                                const canControl = isAdminOrEngineer || isAssignedToTask(task);

                                                const isPending = task.status === "pending";
                                                const isInProgress = task.status === "in_progress";
                                                const isPaused = task.status === "paused";
                                                const isDone = task.status === "done";

                                                const globalIndex = vesselTasks.findIndex((t) => t.id === task.id);
                                                const elapsed = task.elapsed_seconds || 0;
                                                const deadline = task.deadline_seconds || 3600;
                                                const pct = Math.min(100, Math.round((elapsed / deadline) * 100));
                                                const delayed = elapsed > deadline;

                                                return (<Draggable
                                                    key={task.id}
                                                    draggableId={String(task.id)}
                                                    index={globalIndex}
                                                    isDragDisabled={!isEngineer}
                                                >
                                                    {(provided) => (<div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                    >
                                                        <div className="pdf-section">
                                                            <div
                                                                className="task-card"
                                                                style={{
                                                                    breakInside: "avoid-page", pageBreakInside: "avoid"
                                                                }}
                                                            >
                                                                <div
                                                                    className="task-top-row">
                                                                    <div
                                                                        className="task-main-title">
                                                                        {isEngineer && (<span
                                                                            className="drag-icon"
                                                                            {...provided.dragHandleProps}
                                                                        >
                                                        ⠿
                                                      </span>)}
                                                                        <span>{task.title}</span>
                                                                    </div>
                                                                    <div
                                                                        className="task-status-wrap">
                                                    <span
                                                        className={"status-pill " + (task.status === "done" ? "done" : task.status === "in_progress" ? "progress" : "pending")}
                                                    >
                                                      {task.status === "in_progress" ? "In Progress" : task.status === "done" ? "Done" : task.status === "paused" ? "Paused" : "Not Started Yet"}
                                                    </span>
                                                                        {isEngineer && (<button
                                                                            className="icon-btn delete"
                                                                            onClick={() => handleDeleteTask(task.id)}
                                                                        >
                                                                            🗑️
                                                                        </button>)}
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    className="timeline-row">
                                                                    <div
                                                                        className="timeline-meta">
                                                    <span>
                                                      Deadline: {Math.round(deadline / 60)} min
                                                    </span>
                                                                        <span>
                                                      Elapsed: {formatTime(elapsed)}
                                                    </span>
                                                                        {task.status === "in_progress" || task.status === "done" ? (
                                                                            <span
                                                                                className={"time-flag " + (delayed ? "delayed" : "under")}
                                                                            >
                                                        {delayed ? "⚠ Delayed" : "✅ Under Time"}
                                                      </span>) : null}
                                                                    </div>
                                                                    <div
                                                                        className="timeline-bar">
                                                                        <div
                                                                            className={"timeline-fill " + (delayed ? "delayed" : "ok")}
                                                                            style={{width: pct + "%"}}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    className="attachments-row">
                                                                    <div
                                                                        className="attachments-list">
                                                                        {task.attachments && task.attachments.map((att, idx) => (
                                                                            <div
                                                                                key={idx}
                                                                                className="thumb-preview"
                                                                                onClick={() => setPreviewImage(BASE_URL + att.url)}
                                                                            >
                                                                                <img
                                                                                    src={BASE_URL + att.url}
                                                                                    alt={att.originalName}
                                                                                    className="thumb-img"
                                                                                />
                                                                            </div>))}
                                                                        {task.attachments?.length === 0 && (<span
                                                                            className="muted">
                                                        No screenshots yet
                                                      </span>)}
                                                                    </div>
                                                                    {(<label
                                                                        className="upload-btn">
                                                                        {uploadingTaskId === task.id ? "Uploading..." : "Upload Screenshot"}
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            onChange={(e) => handleUpload(task.id, e.target.files[0])}
                                                                        />
                                                                    </label>)}
                                                                </div>

                                                                <div
                                                                    className="task-footer-row">
                                                                    <div
                                                                        className="comments-info">
                                                    <span>
                                                      💬{" "}
                                                        {task.comments?.length || 0}{" "}
                                                        comments
                                                    </span>
                                                                        {task.comments && task.comments[0] && (<span
                                                                            className="muted">
                                                          Last:{" "}
                                                                            {formatTS(task.comments[task.comments.length - 1].timestamp)}
                                                        </span>)}
                                                                    </div>
                                                                    <div
                                                                        className="task-btns">
                                                                        {(isAssignedToTask(task) || isAdminOrEngineer) && (<>
                                                                            {(isPending || isPaused) && (<button
                                                                                className="pill-btn start"
                                                                                onClick={() => handleStartTask(task.id, task)}
                                                                            >
                                                                                ▶
                                                                                {isPaused ? "Resume" : "Start"}
                                                                            </button>)}

                                                                            {isInProgress && (<button
                                                                                className="pill-btn ghost"
                                                                                onClick={() => handlePauseTask(task.id, task)}
                                                                            >
                                                                                Pause
                                                                            </button>)}


                                                                            {(isInProgress || isPaused) && (<button
                                                                                className="pill-btn done"
                                                                                onClick={() => handleDoneTask(task.id, task)}
                                                                            >
                                                                                ✔
                                                                                Done
                                                                            </button>)}
                                                                        </>)}
                                                                        <button
                                                                            className="pill-btn ghost"
                                                                            onClick={() => handleSaveComment(task.id)}
                                                                        >
                                                                            + Comment
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                {task.comments && task.comments.length > 0 && (<div
                                                                    className="comment-thread refined compact">
                                                                    <div
                                                                        className="comment-toggle premium-toggle"
                                                                        onClick={() => toggleComments(task.id)}
                                                                    >
                                                                        💬{" "}
                                                                        {task.comments.length}{" "}
                                                                        Comments
                                                                        <span
                                                                            className="toggle-arrow small-arrow">
                                                          {collapsedComments[task.id] ? "▼" : "▲"}
                                                        </span>
                                                                    </div>

                                                                    {!collapsedComments[task.id] && (<div
                                                                        className="comment-body small-text">
                                                                        {task.comments
                                                                            .filter((c) => !c.parentId)
                                                                            .map((root) => (<div
                                                                                key={root.id}
                                                                                className="comment-item refined"
                                                                            >
                                                                                <p className="comment-text tiny-text">

                                                                                    <strong>
                                                                                        {isClient ? root.role : root.authorName}:
                                                                                    </strong>{" "}
                                                                                    {root.text}
                                                                                </p>
                                                                                <span
                                                                                    className="comment-time micro">
                                                                  {formatTS(root.timestamp)}
                                                                </span>
                                                                                {isAdminOrEngineer && (<span
                                                                                    className="comment-actions micro">
            <button
                type="button"
                className="link-btn"
                onClick={() => handleEditComment(root.id)}
            >
              Edit
            </button>
            <button
                type="button"
                className="link-btn danger"
                onClick={() => handleDeleteComment(root.id)}
            >
              Delete
            </button>
          </span>)}
                                                                                <div
                                                                                    className="comment-replies">
                                                                                    {task.comments
                                                                                        .filter((r) => r.parentId === root.id)
                                                                                        .map((reply) => (<div
                                                                                            key={reply.id}
                                                                                            className="comment-reply compact small-text"
                                                                                        >
                                                                                            <p className="comment-text tiny-text">
                                                                                                <strong>
                                                                                                    {isClient ? reply.role : reply.authorName}
                                                                                                    :
                                                                                                </strong>{" "}
                                                                                                {reply.text}
                                                                                            </p>
                                                                                            <span
                                                                                                className="comment-time micro">
                                                                            {formatTS(reply.timestamp)}
                                                                          </span>
                                                                                            {isAdminOrEngineer && (<span
                                                                                                className="comment-actions micro">
                    <button
                        type="button"
                        className="link-btn"
                        onClick={() => handleEditComment(reply.id)}
                    >
                      Edit
                    </button>
                    <button
                        type="button"
                        className="link-btn danger"
                        onClick={() => handleDeleteComment(reply.id)}
                    >
                      Delete
                    </button>
                  </span>)}
                                                                                        </div>))}
                                                                                </div>
                                                                            </div>))}
                                                                    </div>)}
                                                                </div>)}
                                                                {isAdminOrEngineer && (
                                                                    <div className="assignee-select-wrap">
                                                                        <span
                                                                            className="assignee-label">Assigned:</span>
                                                                        <div className="assignee-select-shell">
                                                                            <select
                                                                                className="assignee-select"
                                                                                value={task.assignedTo || ""}
                                                                                onChange={(e) => handleAssign(task.id, Number(e.target.value) || null)}
                                                                            >
                                                                                <option value="">Unassigned</option>
                                                                                {snapshot.users?.map((u) => (
                                                                                    <option key={u.id} value={u.id}>
                                                                                        {u.name} ({u.role})
                                                                                    </option>))}
                                                                            </select>
                                                                        </div>
                                                                    </div>)}
                                                                {/*{!isClient && <strong>{task.assignedTo || "Unassigned"}</strong>}*/}

                                                            </div>
                                                        </div>
                                                    </div>)}
                                                </Draggable>);
                                            })}
                                        </div>))}
                                        {provided.placeholder}
                                    </div>)}
                                </Droppable>
                            </DragDropContext>
                        </section>
                    </div>)}

                    {activeTab === "endpoints" && (<div className="single-column">
                        <section className="endpoint-section">
                            {/*    <div className="endpoint-timer-bar">*/}
                            {/*        <div className="et-left">*/}
                            {/*            <strong>Elapsed:</strong> {formatTime(selectedVessel?.endpointElapsedSeconds || 0)}*/}
                            {/*            <strong style={{marginLeft: "16px"}}>Per Endpoint:</strong>{" "}*/}
                            {/*            {formatTime(Math.floor((selectedVessel?.endpointElapsedSeconds || 0) / 11))}*/}
                            {/*            <span style={{marginLeft: "16px"}} className="muted small">*/}
                            {/*  Deadline: 30 min each endpoint*/}
                            {/*</span>*/}
                            {/*        </div>*/}
                            {/*        {isEngineer && (<div className="et-right">*/}
                            {/*            {!selectedVessel?.endpointTimerStart || selectedVessel?.endpointTimerEnd ? (<button*/}
                            {/*                className="pill-btn start"*/}
                            {/*                onClick={async () => {*/}
                            {/*                    await fetch(`https://api-onboard.ishipplus.cloud/api/vessels/${selectedVesselId}/endpoint-timer/start`, {*/}
                            {/*                        method: "POST",*/}
                            {/*                        headers: {...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})}*/}
                            {/*                    });*/}
                            {/*                }}*/}
                            {/*            >*/}
                            {/*                ▶ Start Timer*/}
                            {/*            </button>) : (<button*/}
                            {/*                className="pill-btn done"*/}
                            {/*                onClick={async () => {*/}
                            {/*                    await fetch(`https://api-onboard.ishipplus.cloud/api/vessels/${selectedVesselId}/endpoint-timer/stop`, {*/}
                            {/*                        method: "POST",*/}
                            {/*                        headers: {...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {})}*/}
                            {/*                    });*/}
                            {/*                }}*/}
                            {/*            >*/}
                            {/*                ⏹ Stop Timer*/}
                            {/*            </button>)}*/}
                            {/*        </div>)}*/}
                            {/*    </div>*/}
                            <div className="endpoint-timer-bar">
                                <div className="et-left">
                                    <strong>Total Elapsed:</strong> {formatTime(totalEndpointElapsed)}
                                    <strong style={{marginLeft: "16px"}}>Avg per Endpoint:</strong>{" "}
                                    {formatTime(avgEndpointElapsed)}
                                    <span style={{marginLeft: "16px"}} className="muted small">
      Target: 30 min per endpoint
    </span>
                                </div>
                            </div>

                            <div className="endpoint-header">
                                <h3>Endpoint Configuration Checklist</h3>
                                <p className="muted small">
                                    Tap a cell to cycle status: Pending → Done → N/A
                                </p>
                            </div>
                            {vesselEndpoints.length === 0 ? (<p className="muted">
                                No endpoints configured for this vessel yet.
                            </p>) : (<div className="endpoint-table-wrapper">
                                <table className="endpoint-table">
                                    {/*<thead>*/}
                                    {/*<tr>*/}
                                    {/*    <th>Endpoint</th>*/}
                                    {/*    {Object.keys(vesselEndpoints[0].fields || {}).map((fieldKey) => (*/}
                                    {/*        <th key={fieldKey}>*/}
                                    {/*            {ENDPOINT_FIELD_LABELS[fieldKey] || fieldKey}*/}
                                    {/*        </th>))}*/}
                                    {/*</tr>*/}
                                    {/*</thead>*/}
                                    <thead>
                                    <tr>
                                        <th>Endpoint</th>
                                        {isClient ? null : <th>Assignee</th>}
                                        {Object.keys(ENDPOINT_FIELD_LABELS).map(fieldKey => (
                                            <th key={fieldKey}>{ENDPOINT_FIELD_LABELS[fieldKey]}</th>
                                        ))}
                                        <th>Timer / Status</th>
                                        {Object.keys(vesselEndpoints[0].fields || {}).map((fieldKey) => (
                                            <th key={fieldKey}>
                                                {ENDPOINT_FIELD_LABELS[fieldKey] || fieldKey}
                                            </th>))}
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {vesselEndpoints.map((ep) => {
                                        const assignedUser = snapshot.users.find(function (e) {
                                            return e.id === Number(ep.assignedTo)
                                        })
                                        const fieldKeys = Object.keys(ep.fields || {});
                                        const epStatus = ep.status || "not_started";

                                        const statusLabel = epStatus === "in_progress" ? "In Progress" : epStatus === "paused" ? "Paused" : epStatus === "done" ? "Done" : "Not Started";

                                        return (<tr key={ep.id}>
                                            <td className="endpoint-label">{ep.label}</td>
                                            {!isClient ? <td>
                                                {/* Only Admin or Onboard Eng can change the assignee */}
                                                {(auth?.role === "Admin" || auth?.role === "Onboard Eng") ? (
                                                    <select
                                                        className="assign-select"
                                                        value={ep.assignedTo || ""}
                                                        onChange={e =>
                                                            handleAssignEndpoint(ep.id, e.target.value || null)
                                                        }
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {snapshot.users.map(user => (
                                                            <option key={user.id} value={user.id}>
                                                                {user.name} ({user.role})
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span>
              {ep.assignedTo
                  ? `${assignedUser.name} (${assignedUser.role})`
                  : "Unassigned"}
            </span>
                                                )}
                                            </td> : null}

                                            <td className="endpoint-timer-cell">
                                                <div className="endpoint-timer-info small">
                                                    <span>{formatTime(ep.elapsedSeconds || 0)}</span>
                                                    <span className="muted" style={{marginLeft: 6}}>
              {statusLabel}
            </span>
                                                </div>
                                                {!isClient && (<div className="endpoint-actions">
                                                    {(epStatus === "not_started" || epStatus === "paused") && (
                                                        <button
                                                            type="button"
                                                            className="pill-btn tiny start"
                                                            disabled={!canControlEndpoint(ep)}
                                                            onClick={() => handleEndpointStart(ep.id)}
                                                        >
                                                            ▶ {epStatus === "paused" ? "Resume" : "Start"}
                                                        </button>)}
                                                    {epStatus === "in_progress" && (<button
                                                        type="button"
                                                        className="pill-btn tiny ghost"
                                                        disabled={!canControlEndpoint(ep)}
                                                        onClick={() => handleEndpointPause(ep.id)}
                                                    >
                                                        Pause
                                                    </button>)}
                                                    {(epStatus === "in_progress" || epStatus === "paused") && (
                                                        <button
                                                            type="button"
                                                            className="pill-btn tiny done"
                                                            disabled={!canControlEndpoint(ep)}
                                                            onClick={() => handleEndpointDone(ep.id)}
                                                        >
                                                            Done
                                                        </button>)}
                                                </div>)}
                                            </td>

                                            {fieldKeys.map((fieldKey) => {
                                                const val = ep.fields?.[fieldKey] || "pending";
                                                return (<td
                                                    key={fieldKey}
                                                    className={"endpoint-cell status-" + val + (!isClient ? " clickable" : "")}
                                                    onClick={!isClient ? () => handleEndpointFieldChange(ep.id, fieldKey, assignedUser) : undefined}
                                                >
                                                    {val === "done" ? "✓" : val === "na" ? "N/A" : ""}
                                                </td>);
                                            })}
                                        </tr>);
                                    })}
                                    </tbody>

                                </table>
                            </div>)}
                        </section>
                    </div>)}

                    {activeTab === "activity" && (<div className="single-column">
                        <section className="log-column full-width">
                            <h3>Activity Log</h3>
                            <div className="log-list">
                                {vesselLogs.length === 0 && (<p className="muted">No activity yet.</p>)}
                                {vesselLogs.map((log) => (<div key={log.id} className="log-item">
                                    <div className="log-time">
                                        {formatTS(log.timestamp)}
                                    </div>
                                    <div className="log-message">{log.action}</div>
                                    <small style={{color: '#888'}}>
                                        {log.user} ({log.role}) • IP: {log.ip} • {log.userAgent}
                                    </small>

                                </div>))}
                            </div>
                        </section>
                    </div>)}

                    {activeTab === "whatsapp" && auth?.role === "Admin" && (
                        <div className="single-column">
                            <section className="whatsapp-section" style={{padding: "20px", maxWidth: "600px"}}>
                                <h3>WhatsApp Notifications</h3>
                                <p style={{color: "#666", marginBottom: "20px"}}>
                                    Connect WhatsApp to receive task notifications in a group.
                                </p>
                                
                                <div style={{marginBottom: "20px", padding: "15px", background: "#f5f5f5", borderRadius: "8px"}}>
                                    <strong>Status:</strong>{" "}
                                    <span style={{
                                        color: whatsappStatus?.status === "connected" ? "#16a34a" : 
                                               whatsappStatus?.status === "waiting_for_scan" ? "#ca8a04" : "#dc2626"
                                    }}>
                                        {whatsappStatus?.status || "Not initialized"}
                                    </span>
                                </div>

                                {whatsappStatus?.status !== "connected" && (
                                    <button 
                                        onClick={initWhatsApp}
                                        style={{
                                            padding: "12px 24px",
                                            background: "#25D366",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "8px",
                                            cursor: "pointer",
                                            fontSize: "16px",
                                            marginBottom: "20px"
                                        }}
                                    >
                                        Initialize WhatsApp
                                    </button>
                                )}

                                {whatsappQr && whatsappStatus?.status === "waiting_for_scan" && (
                                    <div style={{marginBottom: "20px", textAlign: "center"}}>
                                        <p style={{marginBottom: "10px"}}>Scan this QR code with WhatsApp:</p>
                                        <img 
                                            src={whatsappQr} 
                                            alt="WhatsApp QR Code" 
                                            style={{maxWidth: "300px", border: "1px solid #ddd", borderRadius: "8px"}}
                                        />
                                        <button 
                                            onClick={fetchWhatsAppQr}
                                            style={{
                                                display: "block",
                                                margin: "10px auto",
                                                padding: "8px 16px",
                                                background: "#eee",
                                                border: "none",
                                                borderRadius: "4px",
                                                cursor: "pointer"
                                            }}
                                        >
                                            Refresh QR Code
                                        </button>
                                    </div>
                                )}

                                {whatsappStatus?.status === "connected" && (
                                    <div style={{marginTop: "20px"}}>
                                        <button 
                                            onClick={fetchWhatsAppGroups}
                                            style={{
                                                padding: "10px 20px",
                                                background: "#3b82f6",
                                                color: "white",
                                                border: "none",
                                                borderRadius: "6px",
                                                cursor: "pointer",
                                                marginBottom: "15px"
                                            }}
                                        >
                                            Load Groups
                                        </button>

                                        {whatsappGroups.length > 0 && (
                                            <div>
                                                <label style={{display: "block", marginBottom: "8px", fontWeight: "bold"}}>
                                                    Select notification group:
                                                </label>
                                                <select 
                                                    value={selectedGroupId}
                                                    onChange={(e) => setWhatsAppGroup(e.target.value)}
                                                    style={{
                                                        width: "100%",
                                                        padding: "10px",
                                                        borderRadius: "6px",
                                                        border: "1px solid #ddd",
                                                        fontSize: "14px"
                                                    }}
                                                >
                                                    <option value="">-- Select a group --</option>
                                                    {whatsappGroups.map((g) => (
                                                        <option key={g.id} value={g.id}>{g.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {whatsappStatus?.groupChatId && (
                                            <p style={{marginTop: "15px", color: "#16a34a"}}>
                                                Notifications will be sent to the selected group.
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div style={{marginTop: "30px", padding: "15px", background: "#fef3c7", borderRadius: "8px"}}>
                                    <strong>Note:</strong> WhatsApp doesn't officially support bots. 
                                    Use a secondary number to avoid any issues with your main account.
                                </div>
                            </section>
                        </div>
                    )}
                </>) : (<p className="empty-state">
                    Select a vessel from the left or add one.
                </p>)}
            </main>
        </div>

        {/* Bottom sticky summary bar */}
        {selectedVessel && (<div
            className={sidebarOpen ? "bottom-summary" : "bottom-summary full"}
            style={!sidebarOpen ? {width: "100%", left: 0, right: 0} : {}}
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
            {(isEngineer || isRemote) && (<button className="floating-add-task" onClick={handleAddTask}>
                + Add Task
            </button>)}
        </div>)}
        {previewImage && (<div className="img-modal" onClick={() => setPreviewImage(null)}>
            <img src={previewImage} className="modal-img"/>
        </div>)}
    </div>);
}