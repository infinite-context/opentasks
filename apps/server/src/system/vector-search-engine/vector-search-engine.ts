import type { Logger } from "../../infra/logging";
import type { VectorDatabase } from "../../infra/storage/vector-database";
import type { RetrievedContextItem, TaskRecord } from "@opentasks/contracts";
import type { VectorSearchEngine } from "./types";

interface CreateVectorSearchEngineParams {
  logger: Logger;
  vectorDatabase: VectorDatabase;
}

export function createVectorSearchEngine({
  logger,
  vectorDatabase
}: CreateVectorSearchEngineParams): VectorSearchEngine {
  return {
    async searchTaskContext(task: TaskRecord): Promise<RetrievedContextItem[]> {
      logger.step(
        "vector-search-engine",
        `Vector search engine queries the vector database for task \"${task.id}\".`
      );

      const candidates = await vectorDatabase.search({
        text: `${task.title}\n${task.description}`,
        projectId: task.projectId,
        goalId: task.goalId,
        taskId: task.id
      });

      const rankedResults = candidates
        .filter((item) => item.projectId === task.projectId)
        .map((item) => ({
          ...item,
          score:
            item.taskId === task.id
              ? 1
              : item.goalId === task.goalId
                ? 0.9
                : typeof item.score === "number"
                  ? item.score
                  : 0.75
        }))
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0));

      logger.step(
        "vector-search-engine",
        `Vector search engine returned ${rankedResults.length} retrieval item(s) for task \"${task.id}\".`
      );

      return rankedResults;
    }
  };
}
