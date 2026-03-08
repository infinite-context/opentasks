import type {
  ClaimedTask,
  MemoryArtifact,
  ProjectRecord,
  TaskEvent,
  TaskOutcome,
  TaskRecord,
  TaskStatus
} from "./types";

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: TaskRecord["priority"];
  dependencyIds?: string[];
}

export interface TaskRequest {
  agentName: string;
  projectId: string;
  taskHint?: string;
  capabilities?: string[];
  leaseDurationSeconds?: number;
}

export interface TaskClaimOptions {
  taskHint?: string;
  capabilities?: string[];
  leaseDurationSeconds: number;
}

export interface TaskQueryFilters {
  projectId?: string;
  status?: TaskRecord["status"][];
  assignedTo?: string;
  limit?: number;
}

export interface DashboardQuery {
  projectId?: string;
}

export interface TaskListQuery extends TaskQueryFilters {}

export interface TaskCompletion {
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface TaskFailure {
  error: string;
  metadata?: Record<string, unknown>;
}

export interface TaskRelease {
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface ContextPacket {
  taskId: string;
  relatedMemories: string[];
  notes: string[];
}

export interface HydratedTask extends TaskRecord {
  context: ContextPacket;
}

export interface CompletedRun {
  taskId: string;
  projectId: string;
  summary: string;
  outcome: TaskOutcome;
}

export interface ModelRequest {
  prompt: string;
}

export interface ModelResponse {
  provider: string;
  text: string;
}

export interface TaskDetailDto {
  task: TaskRecord | ClaimedTask | null;
  events: TaskEvent[];
}

export interface TaskListDto {
  tasks: TaskRecord[];
}

export interface TaskClaimResultDto {
  task: ClaimedTask | null;
}

export interface ArtifactBatchDto {
  artifacts: MemoryArtifact[];
}

export interface DashboardSummaryDto {
  totalTasks: number;
  availableTasks: number;
  assignedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeAgents: number;
}

export interface DashboardPipelineItemDto {
  status: TaskStatus;
  count: number;
}

export interface DashboardActivityItemDto {
  taskId: string;
  taskTitle: string | null;
  event: TaskEvent;
}

export interface DashboardAgentStatusDto {
  agentName: string;
  assignedTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  failedTasks: number;
}

export type DashboardHealthState = "healthy" | "degraded" | "warning";

export interface DashboardHealthItemDto {
  name: string;
  state: DashboardHealthState;
  detail: string;
}

export interface DashboardSnapshotDto {
  generatedAt: string;
  project: ProjectRecord | null;
  summary: DashboardSummaryDto;
  pipeline: DashboardPipelineItemDto[];
  tasks: TaskRecord[];
  activity: DashboardActivityItemDto[];
  agents: DashboardAgentStatusDto[];
  health: DashboardHealthItemDto[];
}

export interface DashboardStreamEventDto {
  type: "dashboard.snapshot";
  data: DashboardSnapshotDto;
}
