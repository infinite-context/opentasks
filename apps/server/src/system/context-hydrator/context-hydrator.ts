import type { Logger } from "../../infra/logging";
import type { HydratedTask, TaskRecord } from "../../shared/types";
import type { VectorSearchEngine } from "../vector-search-engine";
import type { ContextHydrator } from "./types";

interface CreateContextHydratorParams {
  logger: Logger;
  vectorSearchEngine: VectorSearchEngine;
}

export function createContextHydrator({
  logger,
  vectorSearchEngine
}: CreateContextHydratorParams): ContextHydrator {
  return {
    async hydrateTask(task: TaskRecord): Promise<HydratedTask> {
      logger.step(
        "context-hydrator",
        `Context hydrator enriches task \"${task.id}\" with reusable context.`
      );

      const relatedMemories = await vectorSearchEngine.searchTaskContext(task);

      return {
        ...task,
        context: {
          taskId: task.id,
          relatedMemories,
          notes: ["Hydrated from the vector search engine for the runnable skeleton."]
        }
      };
    }
  };
}
