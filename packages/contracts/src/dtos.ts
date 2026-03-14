import type {
  ClaimedTask,
  GoalRecord,
  MemoryArtifact,
  OperationStatus,
  ProjectRecord,
  RetrievedContextItem,
  TaskEvent,
  TaskOutcome,
  TaskRecord,
  TaskStatus
} from "./types";

export interface CreateTaskInput {
  projectId: string;
  goalId: string;
  title: string;
  description?: string;
  priority?: TaskRecord["priority"];
  dependencyIds?: string[];
}

export interface CreateProjectInput {
  key: string;
  name: string;
  description: string;
  workingDirectory: string;
}

export interface UpdateProjectInput {
  projectId: string;
  description: string;
}

export interface ProjectListQuery {
  limit?: number;
}

export interface CreateGoalInput {
  projectId: string;
  key: string;
  name: string;
  description?: string;
  priority?: TaskRecord["priority"];
  metadata?: Record<string, unknown>;
}

export interface UpdateGoalInput {
  goalId: string;
  projectId?: string;
  name?: string;
  description?: string;
  status?: GoalRecord["status"];
  priority?: GoalRecord["priority"];
  metadata?: Record<string, unknown>;
}

export interface GoalListQuery {
  projectId: string;
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
  goalId?: string;
  status?: TaskRecord["status"][];
  assignedTo?: string;
  limit?: number;
}

export interface DashboardQuery {
  projectId?: string;
}

export interface TaskListQuery extends TaskQueryFilters {}

export interface TaskSearchQuery extends TaskQueryFilters {
  query: string;
}

export interface TaskClaimByIdInput {
  taskId: string;
  agentName: string;
  leaseDurationSeconds?: number;
}

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
  items: RetrievedContextItem[];
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

export interface AgentRecordDto {
  id: string;
  displayName: string;
  clientName: string | null;
  clientVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface AgentListDto {
  agents: AgentRecordDto[];
}

export interface McpLogRecordDto {
  id: string;
  agentDisplayName: string | null;
  toolName: string;
  argsJson: string;
  resultJson: string | null;
  resultStatus: "ok" | "error";
  errorMessage: string | null;
  createdAt: string;
}

export interface McpLogListDto {
  logs: McpLogRecordDto[];
}

export interface ProjectListDto {
  projects: ProjectRecord[];
}

export interface GoalListDto {
  goals: GoalRecord[];
}

export interface TaskListDto {
  tasks: TaskRecord[];
}

export type TaskSearchMatchedField = "title" | "description";

export interface TaskSearchDependencyDto {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface TaskSearchHitDto {
  task: TaskRecord;
  score: number;
  matchedFields: TaskSearchMatchedField[];
  claimable: boolean;
  nextClaimableDependencyTaskIds: string[];
  unresolvedUpstreamDependencies: TaskSearchDependencyDto[];
}

export interface TaskSearchResultDto {
  query: string;
  results: TaskSearchHitDto[];
}

export interface TaskQueryResolutionDto {
  query: string;
  recommendedTaskId: string | null;
  recommendedTask: TaskRecord | null;
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

export interface OperationContextDto {
  projectId?: string;
  project?: ProjectRecord | null;
  projects?: ProjectRecord[];
  goal?: GoalRecord | null;
  goals?: GoalRecord[];
  goalSummary?: string;
  task?: TaskRecord | ClaimedTask | null;
  events?: TaskEvent[];
  input?: CreateProjectInput;
  field?: string;
  resolvedPath?: string;
}

export interface OperationResultDto {
  status: OperationStatus;
  message: string;
  guidance: string[];
  context?: OperationContextDto;
}
