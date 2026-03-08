import type { ClaimedTask, MemoryArtifact, TaskEvent, TaskOutcome, TaskRecord } from "./types";

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

export interface TaskClaimResultDto {
  task: ClaimedTask | null;
}

export interface ArtifactBatchDto {
  artifacts: MemoryArtifact[];
}
