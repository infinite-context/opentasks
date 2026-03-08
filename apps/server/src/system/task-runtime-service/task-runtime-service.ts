import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type { CreateTaskInput, TaskCompletion, TaskFailure, TaskRelease } from "@opentasks/contracts";
import type { TaskRuntimeService } from "./types";

interface CreateTaskRuntimeServiceParams {
  logger: Logger;
  taskStore: TaskStore;
  defaultLeaseDurationSeconds: number;
}

export function createTaskRuntimeService({
  logger,
  taskStore,
  defaultLeaseDurationSeconds
}: CreateTaskRuntimeServiceParams): TaskRuntimeService {
  return {
    async createTask(input: CreateTaskInput) {
      logger.step("task-runtime-service", `Creating task "${input.title}" in project "${input.projectId}".`);
      return taskStore.createTask(input);
    },
    async getTask(taskId) {
      logger.step("task-runtime-service", `Loading task "${taskId}".`);
      return taskStore.getTaskById(taskId);
    },
    async listTaskEvents(taskId) {
      logger.step("task-runtime-service", `Loading task events for "${taskId}".`);
      return taskStore.listTaskEvents(taskId);
    },
    async listTasks(projectId) {
      logger.step("task-runtime-service", "Listing tasks for the current runtime view.");
      return taskStore.listTasks(projectId ? { projectId } : undefined);
    },
    async startTask(taskId, agentName) {
      logger.step("task-runtime-service", `Marking task "${taskId}" as in progress.`);
      return taskStore.markTaskInProgress(taskId, agentName);
    },
    async renewTaskLease(taskId, agentName, leaseDurationSeconds) {
      logger.step("task-runtime-service", `Renewing lease for task "${taskId}".`);
      return taskStore.renewTaskLease(
        taskId,
        agentName,
        leaseDurationSeconds > 0 ? leaseDurationSeconds : defaultLeaseDurationSeconds
      );
    },
    async completeTask(taskId, agentName, completion: TaskCompletion) {
      logger.step("task-runtime-service", `Completing task "${taskId}".`);
      return taskStore.completeTask(taskId, agentName, completion);
    },
    async failTask(taskId, agentName, failure: TaskFailure) {
      logger.step("task-runtime-service", `Failing task "${taskId}".`);
      return taskStore.failTask(taskId, agentName, failure);
    },
    async releaseTask(taskId, agentName, release: TaskRelease) {
      logger.step("task-runtime-service", `Releasing task "${taskId}" back to the queue.`);
      return taskStore.releaseTask(taskId, agentName, release);
    }
  };
}
