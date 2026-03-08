import type {
  ClaimedTask,
  TaskEvent,
  TaskRecord
} from "../../shared/types";
import type {
  TaskClaimOptions,
  TaskCompletion,
  TaskFailure,
  TaskQueryFilters,
  TaskRelease
} from "../../shared/dtos";

export interface TaskStore {
  claimNextTask(
    projectId: string,
    agentName: string,
    options: TaskClaimOptions
  ): Promise<ClaimedTask | null>;
  getTaskById(taskId: string): Promise<TaskRecord | null>;
  listTasks(filters?: TaskQueryFilters): Promise<TaskRecord[]>;
  markTaskInProgress(taskId: string, agentName: string): Promise<TaskRecord | null>;
  completeTask(taskId: string, agentName: string, completion: TaskCompletion): Promise<TaskRecord | null>;
  failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<TaskRecord | null>;
  releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<TaskRecord | null>;
  renewTaskLease(
    taskId: string,
    agentName: string,
    leaseDurationSeconds: number
  ): Promise<TaskRecord | null>;
  requeueExpiredTasks(projectId?: string): Promise<number>;
  listTaskEvents(taskId: string): Promise<TaskEvent[]>;
}
