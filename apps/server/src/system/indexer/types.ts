import type { MemoryArtifact } from "@opentasks/contracts";
import type { CompletedRun } from "@opentasks/contracts";

export interface Indexer {
  processCompletedRun(run: CompletedRun): Promise<MemoryArtifact[]>;
}
