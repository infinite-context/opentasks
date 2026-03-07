import type { Logger } from "../logging";
import type { ModelRequest, ModelResponse } from "../../shared/types";
import type { ExternalModelProvider } from "./external-model-provider";

interface CreateOpenRouterProviderParams {
  logger: Logger;
}

export function createOpenRouterProvider({ logger }: CreateOpenRouterProviderParams): ExternalModelProvider {
  return {
    name: "openrouter",
    async generate(request: ModelRequest): Promise<ModelResponse> {
      logger.step("provider:openrouter", "OpenRouter receives a placeholder contextual indexing request.");

      return {
        provider: "openrouter",
        text: "Generated contextual indexing artifact for the completed run."
      };
    }
  };
}
