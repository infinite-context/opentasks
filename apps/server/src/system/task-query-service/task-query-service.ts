import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type { TaskListQuery } from "@opentasks/contracts";
import type { TaskQueryService } from "./types";

interface CreateTaskQueryServiceParams {
  logger: Logger;
  taskStore: TaskStore;
}

export function createTaskQueryService({
  logger,
  taskStore
}: CreateTaskQueryServiceParams): TaskQueryService {
  return {
    async getTaskDetail(taskId) {
      logger.step("task-query-service", `Loading task detail for "${taskId}".`);
      const [task, events] = await Promise.all([
        taskStore.getTaskById(taskId),
        taskStore.listTaskEvents(taskId)
      ]);

      return {
        task,
        events
      };
    },
    async listTasks(query?: TaskListQuery) {
      logger.step("task-query-service", "Listing tasks for HTTP consumers.");
      const tasks = await taskStore.listTasks(query);
      return { tasks };
    }
  };
}
