import type { TaskEvent, TaskRecord } from "../../shared/types";
import type { CreateTaskInput, TaskCompletion, TaskFailure, TaskRelease } from "../../shared/dtos";

export interface TaskRuntimeService {
  createTask(input: CreateTaskInput): Promise<TaskRecord | null>;
  getTask(taskId: string): Promise<TaskRecord | null>;
  listTaskEvents(taskId: string): Promise<TaskEvent[]>;
  listTasks(projectId?: string): Promise<TaskRecord[]>;
  startTask(taskId: string, agentName: string): Promise<TaskRecord | null>;
  renewTaskLease(
    taskId: string,
    agentName: string,
    leaseDurationSeconds: number
  ): Promise<TaskRecord | null>;
  completeTask(taskId: string, agentName: string, completion: TaskCompletion): Promise<TaskRecord | null>;
  failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<TaskRecord | null>;
  releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<TaskRecord | null>;
}
