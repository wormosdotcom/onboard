import { db } from './db.js';
import { vessels, tasks, taskComments, taskAttachments, endpoints, logs } from './schema.js';
import { eq, and, desc } from 'drizzle-orm';

export const storage = {
    async getVessels(userRole) {
        if (userRole === 'Admin') {
            return await db.select().from(vessels).orderBy(desc(vessels.createdAt));
        }
        return await db.select().from(vessels).where(eq(vessels.hidden, false)).orderBy(desc(vessels.createdAt));
    },

    async getVessel(id) {
        const [vessel] = await db.select().from(vessels).where(eq(vessels.id, id));
        return vessel;
    },

    async createVessel(vesselData) {
        const [vessel] = await db.insert(vessels).values(vesselData).returning();
        return vessel;
    },

    async updateVessel(id, updates) {
        const [vessel] = await db.update(vessels).set(updates).where(eq(vessels.id, id)).returning();
        return vessel;
    },

    async deleteVessel(id) {
        await db.delete(vessels).where(eq(vessels.id, id));
    },

    async getTasks(vesselId) {
        const taskList = await db.select().from(tasks).where(eq(tasks.vesselId, vesselId)).orderBy(tasks.taskNumber);
        const tasksWithDetails = await Promise.all(taskList.map(async (task) => {
            const comments = await db.select().from(taskComments).where(eq(taskComments.taskId, task.id)).orderBy(taskComments.createdAt);
            const attachments = await db.select().from(taskAttachments).where(eq(taskAttachments.taskId, task.id));
            return {
                id: task.id,
                vesselId: task.vesselId,
                title: task.title,
                group: task.taskGroup,
                status: task.status,
                elapsed_seconds: task.elapsedSeconds,
                deadline_seconds: task.deadlineSeconds,
                taskNumber: task.taskNumber,
                assignedTo: task.assignedTo,
                comments: comments.map(c => ({
                    id: c.id,
                    text: c.body,
                    role: c.role,
                    authorId: c.authorId,
                    authorName: c.authorName,
                    parentId: c.parentId,
                    timestamp: c.createdAt
                })),
                attachments: attachments.map(a => ({
                    url: a.url,
                    originalName: a.originalName,
                    uploadedAt: a.uploadedAt
                }))
            };
        }));
        return tasksWithDetails;
    },

    async getAllTasks() {
        const taskList = await db.select().from(tasks);
        const tasksWithDetails = await Promise.all(taskList.map(async (task) => {
            const comments = await db.select().from(taskComments).where(eq(taskComments.taskId, task.id)).orderBy(taskComments.createdAt);
            const attachments = await db.select().from(taskAttachments).where(eq(taskAttachments.taskId, task.id));
            return {
                id: task.id,
                vesselId: task.vesselId,
                title: task.title,
                group: task.taskGroup,
                status: task.status,
                elapsed_seconds: task.elapsedSeconds,
                deadline_seconds: task.deadlineSeconds,
                taskNumber: task.taskNumber,
                assignedTo: task.assignedTo,
                comments: comments.map(c => ({
                    id: c.id,
                    text: c.body,
                    role: c.role,
                    authorId: c.authorId,
                    authorName: c.authorName,
                    parentId: c.parentId,
                    timestamp: c.createdAt
                })),
                attachments: attachments.map(a => ({
                    url: a.url,
                    originalName: a.originalName,
                    uploadedAt: a.uploadedAt
                }))
            };
        }));
        return tasksWithDetails;
    },

    async getTask(id) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, String(id)));
        if (!task) return null;
        const comments = await db.select().from(taskComments).where(eq(taskComments.taskId, task.id)).orderBy(taskComments.createdAt);
        const attachments = await db.select().from(taskAttachments).where(eq(taskAttachments.taskId, task.id));
        return {
            id: task.id,
            vesselId: task.vesselId,
            title: task.title,
            group: task.taskGroup,
            status: task.status,
            elapsed_seconds: task.elapsedSeconds,
            deadline_seconds: task.deadlineSeconds,
            taskNumber: task.taskNumber,
            assignedTo: task.assignedTo,
            comments: comments.map(c => ({
                id: c.id,
                text: c.body,
                role: c.role,
                authorId: c.authorId,
                authorName: c.authorName,
                parentId: c.parentId,
                timestamp: c.createdAt
            })),
            attachments: attachments.map(a => ({
                url: a.url,
                originalName: a.originalName,
                uploadedAt: a.uploadedAt
            }))
        };
    },

    async createTask(taskData) {
        const [task] = await db.insert(tasks).values({
            id: String(taskData.id),
            vesselId: taskData.vesselId,
            title: taskData.title,
            taskGroup: taskData.group,
            status: taskData.status || 'pending',
            elapsedSeconds: taskData.elapsed_seconds || 0,
            deadlineSeconds: taskData.deadline_seconds || 3600,
            taskNumber: taskData.taskNumber,
            assignedTo: taskData.assignedTo
        }).returning();
        return task;
    },

    async updateTask(id, updates) {
        const dbUpdates = {};
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.elapsed_seconds !== undefined) dbUpdates.elapsedSeconds = updates.elapsed_seconds;
        if (updates.assignedTo !== undefined) dbUpdates.assignedTo = updates.assignedTo;
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.group !== undefined) dbUpdates.taskGroup = updates.group;
        if (updates.deadline_seconds !== undefined) dbUpdates.deadlineSeconds = updates.deadline_seconds;
        
        const [task] = await db.update(tasks).set(dbUpdates).where(eq(tasks.id, String(id))).returning();
        return task;
    },

    async deleteTask(id) {
        await db.delete(tasks).where(eq(tasks.id, String(id)));
    },

    async addComment(taskId, commentData) {
        const [comment] = await db.insert(taskComments).values({
            id: String(commentData.id),
            taskId: String(taskId),
            authorId: commentData.authorId,
            authorName: commentData.authorName,
            role: commentData.role,
            parentId: commentData.parentId,
            body: commentData.text
        }).returning();
        return comment;
    },

    async updateComment(id, text) {
        await db.update(taskComments).set({ body: text }).where(eq(taskComments.id, String(id)));
    },

    async deleteComment(id) {
        await db.delete(taskComments).where(eq(taskComments.id, String(id)));
    },

    async findCommentTask(commentId) {
        const [comment] = await db.select().from(taskComments).where(eq(taskComments.id, String(commentId)));
        if (!comment) return null;
        return await this.getTask(comment.taskId);
    },

    async addAttachment(taskId, attachmentData) {
        const [attachment] = await db.insert(taskAttachments).values({
            id: String(Date.now()),
            taskId: String(taskId),
            url: attachmentData.url,
            originalName: attachmentData.originalName
        }).returning();
        return attachment;
    },

    async getEndpoints(vesselId) {
        const endpointList = await db.select().from(endpoints).where(eq(endpoints.vesselId, vesselId));
        return endpointList.map(ep => ({
            id: ep.id,
            vesselId: ep.vesselId,
            label: ep.label,
            fields: ep.fields || {},
            assignedTo: ep.assignedTo,
            status: ep.status,
            timerRunning: ep.timerRunning,
            elapsedSeconds: ep.elapsedSeconds
        }));
    },

    async getAllEndpoints() {
        const endpointList = await db.select().from(endpoints);
        return endpointList.map(ep => ({
            id: ep.id,
            vesselId: ep.vesselId,
            label: ep.label,
            fields: ep.fields || {},
            assignedTo: ep.assignedTo,
            status: ep.status,
            timerRunning: ep.timerRunning,
            elapsedSeconds: ep.elapsedSeconds
        }));
    },

    async getEndpoint(id) {
        const [ep] = await db.select().from(endpoints).where(eq(endpoints.id, String(id)));
        if (!ep) return null;
        return {
            id: ep.id,
            vesselId: ep.vesselId,
            label: ep.label,
            fields: ep.fields || {},
            assignedTo: ep.assignedTo,
            status: ep.status,
            timerRunning: ep.timerRunning,
            elapsedSeconds: ep.elapsedSeconds
        };
    },

    async createEndpoint(endpointData) {
        const [ep] = await db.insert(endpoints).values({
            id: String(endpointData.id),
            vesselId: endpointData.vesselId,
            label: endpointData.label,
            fields: endpointData.fields || {},
            assignedTo: endpointData.assignedTo,
            status: endpointData.status || 'not_started',
            timerRunning: endpointData.timerRunning || false,
            elapsedSeconds: endpointData.elapsedSeconds || 0
        }).returning();
        return ep;
    },

    async updateEndpoint(id, updates) {
        const dbUpdates = {};
        if (updates.fields !== undefined) dbUpdates.fields = updates.fields;
        if (updates.assignedTo !== undefined) dbUpdates.assignedTo = updates.assignedTo;
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.timerRunning !== undefined) dbUpdates.timerRunning = updates.timerRunning;
        if (updates.elapsedSeconds !== undefined) dbUpdates.elapsedSeconds = updates.elapsedSeconds;
        
        const [ep] = await db.update(endpoints).set(dbUpdates).where(eq(endpoints.id, String(id))).returning();
        return ep;
    },

    async getLogs(vesselId) {
        const logList = await db.select().from(logs).where(eq(logs.vesselId, vesselId)).orderBy(desc(logs.createdAt));
        return logList.map(l => ({
            id: l.id,
            vesselId: l.vesselId,
            action: l.action,
            timestamp: l.createdAt,
            user: l.userName,
            role: l.role,
            ip: l.ip,
            userAgent: l.userAgent
        }));
    },

    async getAllLogs() {
        const logList = await db.select().from(logs).orderBy(desc(logs.createdAt));
        return logList.map(l => ({
            id: l.id,
            vesselId: l.vesselId,
            action: l.action,
            timestamp: l.createdAt,
            user: l.userName,
            role: l.role,
            ip: l.ip,
            userAgent: l.userAgent
        }));
    },

    async addLog(vesselId, action, req) {
        const [log] = await db.insert(logs).values({
            vesselId,
            action,
            userId: req?.user?.id,
            userName: req?.user?.name || 'System',
            role: req?.user?.role || 'System',
            ip: req?.ip || req?.connection?.remoteAddress || 'unknown',
            userAgent: req?.get?.('User-Agent') || 'unknown'
        }).returning();
        return log;
    }
};
