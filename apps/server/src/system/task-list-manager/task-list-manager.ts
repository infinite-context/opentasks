import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type { TaskListManager } from "./types";

interface CreateTaskListManagerParams {
  logger: Logger;
  taskStore: TaskStore;
}

export function createTaskListManager({
  logger,
  taskStore
}: CreateTaskListManagerParams): TaskListManager {
  return {
    async claimNextTask(projectId, goalId, agentName, options) {
      logger.step(
        "task-list-manager",
        `Task list manager asks the task store to claim the next available task in goal "${goalId}".`
      );

      return taskStore.claimNextTask(projectId, goalId, agentName, options);
    }
  };
}
