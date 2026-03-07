import type { Logger } from "../../infra/logging";
import type { CompletedRun, MemoryArtifact } from "../../shared/types";
import type { Indexer } from "../indexer";
import type { McpTransport } from "../../transport/mcp";

export interface LearningLoop {
  run(run: CompletedRun): Promise<MemoryArtifact[]>;
}

interface CreateLearningLoopParams {
  logger: Logger;
  mcpTransport: McpTransport;
  indexer: Indexer;
}

export function createLearningLoop({
  logger,
  mcpTransport,
  indexer
}: CreateLearningLoopParams): LearningLoop {
  return {
    async run(completedRun: CompletedRun): Promise<MemoryArtifact[]> {
      logger.section("Learning Loop");

      const run = await mcpTransport.receiveCompletedRun(completedRun);

      logger.step("learning-loop", "MCP server forwards the completed run context to the indexer.");
      const artifacts = await indexer.processCompletedRun(run);

      logger.step(
        "learning-loop",
        `Learning loop completes after generating ${artifacts.length} memory artifact(s).`
      );

      return artifacts;
    }
  };
}
