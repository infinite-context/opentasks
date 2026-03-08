import type { Logger } from "../logging";
import type { MemoryArtifact } from "../../shared/types";

export interface VectorDatabase {
  search(taskId: string): Promise<string[]>;
  upsert(artifacts: MemoryArtifact[]): Promise<void>;
}

interface CreateVectorDatabaseParams {
  logger: Logger;
}

export function createVectorDatabase({ logger }: CreateVectorDatabaseParams): VectorDatabase {
  return {
    async search(taskId: string): Promise<string[]> {
      logger.step(
        "storage:vector-db",
        `Vector database returns reusable context candidates for task \"${taskId}\".`
      );

      return [
        "Prior task runs suggest hydrating each task with only the most relevant memory.",
        "Use retrieval before task execution to avoid rediscovery work."
      ];
    },
    async upsert(artifacts: MemoryArtifact[]): Promise<void> {
      logger.step(
        "storage:vector-db",
        `Vector database stores ${artifacts.length} generated memory artifact(s) for future runs.`
      );
    }
  };
}
