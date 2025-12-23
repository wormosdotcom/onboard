import { pgTable, text, integer, boolean, timestamp, serial, uuid, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow()
});

export const vessels = pgTable('vessels', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    imo: text('imo'),
    status: text('status').default('not_started'),
    hidden: boolean('hidden').default(false),
    createdAt: timestamp('created_at').defaultNow()
});

export const tasks = pgTable('tasks', {
    id: text('id').primaryKey(),
    vesselId: text('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    taskGroup: text('task_group').notNull(),
    status: text('status').default('pending'),
    elapsedSeconds: integer('elapsed_seconds').default(0),
    deadlineSeconds: integer('deadline_seconds').default(3600),
    taskNumber: integer('task_number'),
    assignedTo: integer('assigned_to'),
    createdAt: timestamp('created_at').defaultNow()
});

export const taskComments = pgTable('task_comments', {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: integer('author_id'),
    authorName: text('author_name'),
    role: text('role'),
    parentId: text('parent_id'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow()
});

export const taskAttachments = pgTable('task_attachments', {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    originalName: text('original_name'),
    uploadedAt: timestamp('uploaded_at').defaultNow()
});

export const endpoints = pgTable('endpoints', {
    id: text('id').primaryKey(),
    vesselId: text('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    fields: jsonb('fields').default({}),
    assignedTo: text('assigned_to'),
    status: text('status').default('not_started'),
    timerRunning: boolean('timer_running').default(false),
    elapsedSeconds: integer('elapsed_seconds').default(0),
    createdAt: timestamp('created_at').defaultNow()
});

export const logs = pgTable('logs', {
    id: serial('id').primaryKey(),
    vesselId: text('vessel_id').references(() => vessels.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    userId: integer('user_id'),
    userName: text('user_name'),
    role: text('role'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow()
});

export const vesselsRelations = relations(vessels, ({ many }) => ({
    tasks: many(tasks),
    endpoints: many(endpoints),
    logs: many(logs)
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
    vessel: one(vessels, {
        fields: [tasks.vesselId],
        references: [vessels.id]
    }),
    comments: many(taskComments),
    attachments: many(taskAttachments)
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
    task: one(tasks, {
        fields: [taskComments.taskId],
        references: [tasks.id]
    })
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
    task: one(tasks, {
        fields: [taskAttachments.taskId],
        references: [tasks.id]
    })
}));

export const endpointsRelations = relations(endpoints, ({ one }) => ({
    vessel: one(vessels, {
        fields: [endpoints.vesselId],
        references: [vessels.id]
    })
}));

export const logsRelations = relations(logs, ({ one }) => ({
    vessel: one(vessels, {
        fields: [logs.vesselId],
        references: [vessels.id]
    })
}));
