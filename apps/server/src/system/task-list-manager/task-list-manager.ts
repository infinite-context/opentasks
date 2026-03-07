import type { Logger } from "../../infra/logging";
import type { PostgresTaskDatabase } from "../../infra/storage/postgres-task-database";
import type { TaskListManager } from "./types";

interface CreateTaskListManagerParams {
  logger: Logger;
  taskDatabase: PostgresTaskDatabase;
}

export function createTaskListManager({
  logger,
  taskDatabase
}: CreateTaskListManagerParams): TaskListManager {
  return {
    async selectAvailableTask(projectId) {
      logger.step(
        "task-list-manager",
        "Task list manager queries the task database for dependency-aware available work."
      );

      return taskDatabase.getAvailableTask(projectId);
    }
  };
}
