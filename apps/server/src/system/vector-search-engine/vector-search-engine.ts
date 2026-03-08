import type { Logger } from "../../infra/logging";
import type { VectorDatabase } from "../../infra/storage/vector-database";
import type { TaskRecord } from "@opentasks/contracts";
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
    async searchTaskContext(task: TaskRecord): Promise<string[]> {
      logger.step(
        "vector-search-engine",
        `Vector search engine queries the vector database for task \"${task.id}\".`
      );

      return vectorDatabase.search(task.id);
    }
  };
}
