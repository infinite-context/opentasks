import type { Logger } from "../../infra/logging";
import type { ExternalModelProvider } from "../../infra/providers/external-model-provider";
import type { ModelRequest, ModelResponse } from "@opentasks/contracts";
import type { ModelProviderService } from "./types";

interface CreateModelProviderServiceParams {
  logger: Logger;
  provider: ExternalModelProvider;
}

export function createModelProviderService({
  logger,
  provider
}: CreateModelProviderServiceParams): ModelProviderService {
  return {
    async sendModelRequest(request: ModelRequest): Promise<ModelResponse> {
      logger.step(
        "model-provider-service",
        `Model provider service forwards the request to ${provider.name}.`
      );

      return provider.generate(request);
    }
  };
}
