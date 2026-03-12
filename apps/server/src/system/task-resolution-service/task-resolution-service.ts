import type { TaskQueryResolutionDto, TaskRecord, TaskSearchQuery } from "@opentasks/contracts";
import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type { TaskQueryService } from "../task-query-service";
import type { TaskResolutionService } from "./types";

interface CreateTaskResolutionServiceParams {
  logger: Logger;
  taskQueryService: TaskQueryService;
  taskStore: TaskStore;
}

export function createTaskResolutionService({
  logger,
  taskQueryService,
  taskStore
}: CreateTaskResolutionServiceParams): TaskResolutionService {
  return {
    async recommendTaskForQuery(query: TaskSearchQuery): Promise<TaskQueryResolutionDto> {
      logger.step(
        "task-resolution-service",
        `Resolving a recommended task for query consumers using "${query.query}".`
      );

      const searchResult = await taskQueryService.searchTasks(query);

      const directMatch = searchResult.results.find((result) => result.claimable);
      if (directMatch) {
        return {
          query: searchResult.query,
          recommendedTaskId: directMatch.task.id,
          recommendedTask: directMatch.task
        };
      }

      const nextDependencyTaskIds = [
        ...new Set(
          searchResult.results.flatMap((result) => result.nextClaimableDependencyTaskIds)
        )
      ];

      const recommendedTask = await resolveRecommendedTask(nextDependencyTaskIds, taskStore);

      return {
        query: searchResult.query,
        recommendedTaskId: recommendedTask?.id ?? null,
        recommendedTask
      };
    }
  };
}

async function resolveRecommendedTask(
  taskIds: string[],
  taskStore: TaskStore
): Promise<TaskRecord | null> {
  for (const taskId of taskIds) {
    const task = await taskStore.getTaskById(taskId);
    if (task) {
      return task;
    }
  }

  return null;
}
