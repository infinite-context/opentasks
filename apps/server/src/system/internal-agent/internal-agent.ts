import type { Logger } from "../../infra/logging";
import type { MemoryArtifact } from "../../shared/types";
import type { CompletedRun } from "../../shared/dtos";
import type { ModelProviderService } from "../model-provider-service";
import type { InternalAgent } from "./types";

interface CreateInternalAgentParams {
  logger: Logger;
  modelProviderService: ModelProviderService;
}

export function createInternalAgent({
  logger,
  modelProviderService
}: CreateInternalAgentParams): InternalAgent {
  return {
    async generateArtifacts(run: CompletedRun): Promise<MemoryArtifact[]> {
      logger.step(
        "internal-agent",
        "Internal agent prepares contextual indexing work for the model provider service."
      );

      const response = await modelProviderService.sendModelRequest({
        prompt: `Summarize reusable context for completed task ${run.taskId}: ${run.summary}`
      });

      logger.step(
        "internal-agent",
        "Internal agent converts the provider response into reusable memory artifacts."
      );

      return [
        {
          id: "memory-001",
          taskId: run.taskId,
          summary: response.text,
          source: "contextual-indexing"
        }
      ];
    }
  };
}
