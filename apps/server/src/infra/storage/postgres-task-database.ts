import type { Logger } from "../logging";
import type { TaskRecord } from "../../shared/types";

export interface PostgresTaskDatabase {
  getAvailableTask(projectId: string): Promise<TaskRecord>;
}

interface CreatePostgresTaskDatabaseParams {
  logger: Logger;
}

export function createPostgresTaskDatabase({ logger }: CreatePostgresTaskDatabaseParams): PostgresTaskDatabase {
  return {
    async getAvailableTask(projectId: string): Promise<TaskRecord> {
      logger.step(
        "storage:postgres-task-db",
        `PostgreSQL task database returns the next available task for project \"${projectId}\".`
      );

      return {
        id: "task-001",
        title: "Hydrate the next task with reusable context",
        projectId,
        status: "available"
      };
    }
  };
}
