import type { MemoryArtifact } from "../../shared/types";
import type { CompletedRun } from "../../shared/dtos";

export interface InternalAgent {
  generateArtifacts(run: CompletedRun): Promise<MemoryArtifact[]>;
}
