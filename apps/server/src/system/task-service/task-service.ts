import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type {
  ClaimedTask,
  CreateTaskInput,
  TaskCompletion,
  TaskEvent,
  TaskFailure,
  TaskRecord,
  TaskRelease,
  TaskRequest
} from "@opentasks/contracts";

export interface TaskService {
  createTask(input: CreateTaskInput): Promise<TaskRecord | null>;
  requestTask(request: TaskRequest): Promise<ClaimedTask | null>;
  startTask(taskId: string, agentName: string): Promise<TaskRecord | null>;
  completeTask(taskId: string, agentName: string, completion: TaskCompletion): Promise<TaskRecord | null>;
  failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<TaskRecord | null>;
  releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<TaskRecord | null>;
  renewTaskLease(taskId: string, agentName: string, leaseDurationSeconds: number): Promise<TaskRecord | null>;
  getTask(taskId: string): Promise<TaskRecord | null>;
  listTaskEvents(taskId: string): Promise<TaskEvent[]>;
}

interface CreateTaskServiceParams {
  logger: Logger;
  taskStore: TaskStore;
  defaultLeaseDurationSeconds: number;
}

export function createTaskService({
  logger,
  taskStore,
  defaultLeaseDurationSeconds
}: CreateTaskServiceParams): TaskService {
  return {
    async createTask(input: CreateTaskInput) {
      return taskStore.createTask(input);
    },
    async requestTask(request: TaskRequest) {
      return taskStore.claimNextTask(request.projectId, request.agentName, {
        capabilities: request.capabilities,
        taskHint: request.taskHint,
        leaseDurationSeconds: defaultLeaseDurationSeconds
      });
    },
    async startTask(taskId: string, agentName: string) {
      return taskStore.markTaskInProgress(taskId, agentName);
    },
    async completeTask(taskId: string, agentName: string, completion: TaskCompletion) {
      return taskStore.completeTask(taskId, agentName, completion);
    },
    async failTask(taskId: string, agentName: string, failure: TaskFailure) {
      return taskStore.failTask(taskId, agentName, failure);
    },
    async releaseTask(taskId: string, agentName: string, release: TaskRelease) {
      return taskStore.releaseTask(taskId, agentName, release);
    },
    async renewTaskLease(taskId: string, agentName: string, leaseDurationSeconds: number) {
      return taskStore.renewTaskLease(taskId, agentName, leaseDurationSeconds);
    },
    async getTask(taskId: string) {
      return taskStore.getTaskById(taskId);
    },
    async listTaskEvents(taskId: string) {
      return taskStore.listTaskEvents(taskId);
    }
  };
}
