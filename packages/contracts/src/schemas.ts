import { z } from "zod";

export const metadataSchema = z.record(z.string(), z.unknown());

export const taskStatusSchema = z.enum([
  "pending",
  "available",
  "assigned",
  "in_progress",
  "blocked",
  "completed",
  "failed",
  "cancelled"
]);

export const taskPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export const taskSourceSchema = z.enum(["seeded", "manual", "system"]);
export const goalStatusSchema = z.enum(["active", "paused", "completed", "cancelled"]);
export const taskEventTypeSchema = z.enum([
  "task_created",
  "task_available",
  "task_claimed",
  "task_started",
  "task_heartbeat",
  "task_completed",
  "task_failed",
  "task_blocked",
  "task_released",
  "task_requeued"
]);
export const taskEventActorTypeSchema = z.enum(["agent", "system"]);
export const taskOutcomeSchema = z.enum(["success", "failure"]);

export const projectRecordSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  workingDirectory: z.string().default(""),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const goalRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  status: goalStatusSchema,
  priority: taskPrioritySchema,
  metadata: metadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const taskRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  goalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  availableAt: z.string().min(1).nullable(),
  assignedTo: z.string().min(1).nullable(),
  assignedAt: z.string().min(1).nullable(),
  leaseExpiresAt: z.string().min(1).nullable(),
  startedAt: z.string().min(1).nullable(),
  completedAt: z.string().min(1).nullable(),
  failedAt: z.string().min(1).nullable(),
  blockedReason: z.string().min(1).nullable(),
  lastError: z.string().min(1).nullable(),
  source: taskSourceSchema,
  metadata: metadataSchema,
  dependencyIds: z.array(z.string().min(1)),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const claimedTaskSchema = taskRecordSchema.extend({
  status: z.enum(["assigned", "in_progress"]),
  assignedTo: z.string().min(1),
  assignedAt: z.string().min(1),
  leaseExpiresAt: z.string().min(1)
});

export const taskEventSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  eventType: taskEventTypeSchema,
  actorType: taskEventActorTypeSchema,
  actorId: z.string().min(1).nullable(),
  payload: metadataSchema,
  createdAt: z.string().min(1)
});

export const memoryArtifactSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  summary: z.string().min(1),
  source: z.literal("contextual-indexing")
});

export const createTaskInputSchema = z.object({
  projectId: z.string().min(1),
  goalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  dependencyIds: z.array(z.string().min(1)).optional()
});

export const createProjectInputSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  workingDirectory: z.string().min(1)
});

export const projectListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional()
});

export const createGoalInputSchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  priority: taskPrioritySchema.optional(),
  metadata: metadataSchema.optional()
});

export const updateGoalInputSchema = z.object({
  goalId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: goalStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  metadata: metadataSchema.optional()
});

export const goalListQuerySchema = z.object({
  projectId: z.string().min(1)
});

export const taskRequestSchema = z.object({
  agentName: z.string().min(1),
  projectId: z.string().min(1),
  taskHint: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).optional(),
  leaseDurationSeconds: z.number().int().positive().optional()
});

export const taskClaimOptionsSchema = z.object({
  taskHint: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).optional(),
  leaseDurationSeconds: z.number().int().positive()
});

export const taskQueryFiltersSchema = z.object({
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  status: z.array(taskStatusSchema).optional(),
  assignedTo: z.string().min(1).optional(),
  limit: z.number().int().positive().optional()
});

export const dashboardQuerySchema = z.object({
  projectId: z.string().min(1).optional()
});

export const taskListQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  status: z.array(taskStatusSchema).optional(),
  assignedTo: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().optional()
});

export const taskSearchQuerySchema = z.object({
  query: z.string().min(1),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  status: z.array(taskStatusSchema).optional(),
  assignedTo: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().optional()
});

export const taskActionSchema = z.object({
  taskId: z.string().min(1),
  agentName: z.string().min(1)
});

export const taskClaimByIdSchema = taskActionSchema.extend({
  leaseDurationSeconds: z.coerce.number().int().positive().optional()
});

export const taskCompletionSchema = z.object({
  summary: z.string().min(1),
  metadata: metadataSchema.optional()
});

export const taskFailureSchema = z.object({
  error: z.string().min(1),
  metadata: metadataSchema.optional()
});

export const taskReleaseSchema = z.object({
  reason: z.string().min(1),
  metadata: metadataSchema.optional()
});

export const contextPacketSchema = z.object({
  taskId: z.string().min(1),
  relatedMemories: z.array(z.string().min(1)),
  notes: z.array(z.string())
});

export const hydratedTaskSchema = taskRecordSchema.extend({
  context: contextPacketSchema
});

export const completedRunSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  summary: z.string().min(1),
  outcome: taskOutcomeSchema
});

export const modelRequestSchema = z.object({
  prompt: z.string().min(1)
});

export const modelResponseSchema = z.object({
  provider: z.string().min(1),
  text: z.string()
});

export const taskDetailDtoSchema = z.object({
  task: z.union([taskRecordSchema, claimedTaskSchema]).nullable(),
  events: z.array(taskEventSchema)
});

export const projectListDtoSchema = z.object({
  projects: z.array(projectRecordSchema)
});

export const goalListDtoSchema = z.object({
  goals: z.array(goalRecordSchema)
});

export const taskListDtoSchema = z.object({
  tasks: z.array(taskRecordSchema)
});

export const taskSearchMatchedFieldSchema = z.enum(["title", "description"]);

export const taskSearchDependencyDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: taskStatusSchema
});

export const taskSearchHitDtoSchema = z.object({
  task: taskRecordSchema,
  score: z.number(),
  matchedFields: z.array(taskSearchMatchedFieldSchema),
  claimable: z.boolean(),
  nextClaimableDependencyTaskIds: z.array(z.string().min(1)),
  unresolvedUpstreamDependencies: z.array(taskSearchDependencyDtoSchema)
});

export const taskSearchResultDtoSchema = z.object({
  query: z.string().min(1),
  results: z.array(taskSearchHitDtoSchema)
});

export const taskClaimResultDtoSchema = z.object({
  task: claimedTaskSchema.nullable()
});

export const artifactBatchDtoSchema = z.object({
  artifacts: z.array(memoryArtifactSchema)
});

export const dashboardSummaryDtoSchema = z.object({
  totalTasks: z.number().int().nonnegative(),
  availableTasks: z.number().int().nonnegative(),
  assignedTasks: z.number().int().nonnegative(),
  inProgressTasks: z.number().int().nonnegative(),
  blockedTasks: z.number().int().nonnegative(),
  completedTasks: z.number().int().nonnegative(),
  failedTasks: z.number().int().nonnegative(),
  activeAgents: z.number().int().nonnegative()
});

export const dashboardPipelineItemDtoSchema = z.object({
  status: taskStatusSchema,
  count: z.number().int().nonnegative()
});

export const dashboardActivityItemDtoSchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string().min(1).nullable(),
  event: taskEventSchema
});

export const dashboardAgentStatusDtoSchema = z.object({
  agentName: z.string().min(1),
  assignedTasks: z.number().int().nonnegative(),
  inProgressTasks: z.number().int().nonnegative(),
  completedTasks: z.number().int().nonnegative(),
  failedTasks: z.number().int().nonnegative()
});

export const dashboardHealthStateSchema = z.enum(["healthy", "degraded", "warning"]);

export const dashboardHealthItemDtoSchema = z.object({
  name: z.string().min(1),
  state: dashboardHealthStateSchema,
  detail: z.string().min(1)
});

export const dashboardSnapshotDtoSchema = z.object({
  generatedAt: z.string().min(1),
  project: projectRecordSchema.nullable(),
  summary: dashboardSummaryDtoSchema,
  pipeline: z.array(dashboardPipelineItemDtoSchema),
  tasks: z.array(taskRecordSchema),
  activity: z.array(dashboardActivityItemDtoSchema),
  agents: z.array(dashboardAgentStatusDtoSchema),
  health: z.array(dashboardHealthItemDtoSchema)
});

export const dashboardStreamEventDtoSchema = z.object({
  type: z.literal("dashboard.snapshot"),
  data: dashboardSnapshotDtoSchema
});

export const operationStatusSchema = z.enum([
  "ok",
  "missing_project",
  "missing_goals",
  "project_not_found",
  "goal_not_found",
  "task_not_found",
  "goal_project_mismatch",
  "task_goal_mismatch",
  "no_task_available",
  "invalid_transition"
]);

export const operationContextDtoSchema = z.object({
  project: projectRecordSchema.nullable().optional(),
  projects: z.array(projectRecordSchema).optional(),
  goal: goalRecordSchema.nullable().optional(),
  goals: z.array(goalRecordSchema).optional(),
  task: z.union([taskRecordSchema, claimedTaskSchema]).nullable().optional(),
  events: z.array(taskEventSchema).optional()
});

export const operationResultDtoSchema = z.object({
  status: operationStatusSchema,
  message: z.string().min(1),
  guidance: z.array(z.string().min(1)),
  context: operationContextDtoSchema.optional()
});
