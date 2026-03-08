import type { MemoryArtifact } from "@opentasks/contracts";
import type { CompletedRun } from "@opentasks/contracts";

export interface InternalAgent {
  generateArtifacts(run: CompletedRun): Promise<MemoryArtifact[]>;
}
