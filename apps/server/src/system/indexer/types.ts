import type { CompletedRun, MemoryArtifact } from "../../shared/types";

export interface Indexer {
  processCompletedRun(run: CompletedRun): Promise<MemoryArtifact[]>;
}
