import type { AuditableModel, IdentityModel } from "./primitives";

export type TaskStatus =
  | "pending"
  | "available"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskPriority = "P0" | "P1" | "P2" | "P3";
export type TaskSource = "seeded" | "manual" | "system";
export type TaskEventType =
  | "task_created"
  | "task_available"
  | "task_claimed"
  | "task_started"
  | "task_heartbeat"
  | "task_completed"
  | "task_failed"
  | "task_blocked"
  | "task_released"
  | "task_requeued";
export type TaskEventActorType = "agent" | "system";
export type TaskOutcome = "success" | "failure";

export interface ProjectRecord extends AuditableModel {
  key: string;
  name: string;
}

export interface TaskRecord extends AuditableModel {
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  availableAt: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  blockedReason: string | null;
  lastError: string | null;
  source: TaskSource;
  metadata: Record<string, unknown>;
  dependencyIds: string[];
}

export interface ClaimedTask extends TaskRecord {
  status: "assigned" | "in_progress";
  assignedTo: string;
  assignedAt: string;
  leaseExpiresAt: string;
}

export interface TaskEvent extends IdentityModel {
  taskId: string;
  projectId: string;
  eventType: TaskEventType;
  actorType: TaskEventActorType;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MemoryArtifact extends IdentityModel {
  taskId: string;
  summary: string;
  source: "contextual-indexing";
}
