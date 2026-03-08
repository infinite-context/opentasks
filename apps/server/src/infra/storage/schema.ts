import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  workingDirectory: text("working_directory").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["active", "paused", "completed", "cancelled"] }).notNull(),
  priority: text("priority", { enum: ["P0", "P1", "P2", "P3"] }).notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (table) => {
  return {
    projectKeyUniqueIdx: index("idx_goals_project_key").on(table.projectId, table.key),
    projectStatusPriorityIdx: index("idx_goals_project_status_priority").on(table.projectId, table.status, table.priority),
  };
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  goalId: text("goal_id").references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ['pending', 'available', 'assigned', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled'] }).notNull(),
  priority: text("priority", { enum: ['P0', 'P1', 'P2', 'P3'] }).notNull(),
  availableAt: text("available_at"),
  assignedTo: text("assigned_to"),
  assignedAt: text("assigned_at"),
  leaseExpiresAt: text("lease_expires_at"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  failedAt: text("failed_at"),
  blockedReason: text("blocked_reason"),
  lastError: text("last_error"),
  source: text("source", { enum: ['seeded', 'manual', 'system'] }).notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (table) => {
  return {
    projectStatusAvailableIdx: index("idx_tasks_project_status_available").on(table.projectId, table.status, table.availableAt),
    goalStatusAvailableIdx: index("idx_tasks_goal_status_available").on(table.goalId, table.status, table.availableAt),
    assignedStatusIdx: index("idx_tasks_assigned_status").on(table.assignedTo, table.status),
    leaseExpiresIdx: index("idx_tasks_lease_expires").on(table.leaseExpiresAt),
    updatedAtIdx: index("idx_tasks_updated_at").on(table.updatedAt),
  };
});

export const taskDependencies = sqliteTable("task_dependencies", {
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  dependsOnTaskId: text("depends_on_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    dependencyIdx: index("idx_task_dependencies_dependency").on(table.dependsOnTaskId),
  };
});

export const taskEvents = sqliteTable("task_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => {
  return {
    taskCreatedAtIdx: index("idx_task_events_task_created_at").on(table.taskId, table.createdAt),
    projectCreatedAtIdx: index("idx_task_events_project_created_at").on(table.projectId, table.createdAt),
  };
});
