import type { Logger } from "../../infra/logging";
import type { MemoryArtifact } from "../../shared/types";
import type { CompletedRun } from "../../shared/dtos";
import type { Indexer } from "../indexer";

export interface LearningLoop {
  run(run: CompletedRun): Promise<MemoryArtifact[]>;
}

interface CreateLearningLoopParams {
  logger: Logger;
  indexer: Indexer;
}

export function createLearningLoop({
  logger,
  indexer
}: CreateLearningLoopParams): LearningLoop {
  return {
    async run(completedRun: CompletedRun): Promise<MemoryArtifact[]> {
      logger.section("Learning Loop");
      logger.step("learning-loop", "Learning loop forwards completed run context to the indexer.");
      const artifacts = await indexer.processCompletedRun(completedRun);

      logger.step(
        "learning-loop",
        `Learning loop completes after generating ${artifacts.length} memory artifact(s).`
      );

      return artifacts;
    }
  };
}
