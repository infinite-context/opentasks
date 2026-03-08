import type { MemoryArtifact } from "../../shared/types";
import type { CompletedRun } from "../../shared/dtos";

export interface Indexer {
  processCompletedRun(run: CompletedRun): Promise<MemoryArtifact[]>;
}
