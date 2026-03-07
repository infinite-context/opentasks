import type { CompletedRun, MemoryArtifact } from "../../shared/types";

export interface InternalAgent {
  generateArtifacts(run: CompletedRun): Promise<MemoryArtifact[]>;
}
