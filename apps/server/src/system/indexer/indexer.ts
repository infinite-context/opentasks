import type { Logger } from "../../infra/logging";
import type { VectorDatabase } from "../../infra/storage/vector-database";
import type { CompletedRun, MemoryArtifact } from "../../shared/types";
import type { InternalAgent } from "../internal-agent";
import type { Indexer } from "./types";

interface CreateIndexerParams {
  logger: Logger;
  internalAgent: InternalAgent;
  vectorDatabase: VectorDatabase;
}

export function createIndexer({
  logger,
  internalAgent,
  vectorDatabase
}: CreateIndexerParams): Indexer {
  return {
    async processCompletedRun(run: CompletedRun): Promise<MemoryArtifact[]> {
      logger.step(
        "indexer",
        `Indexer processes completed run data for task \"${run.taskId}\".`
      );

      const artifacts = await internalAgent.generateArtifacts(run);

      logger.step(
        "indexer",
        "Indexer stores generated memory artifacts in the vector database."
      );

      await vectorDatabase.upsert(artifacts);
      return artifacts;
    }
  };
}
