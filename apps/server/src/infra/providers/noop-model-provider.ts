import type { Logger } from "../logging";
import type { ModelResponse } from "@opentasks/contracts";
import type { ExternalModelProvider } from "./external-model-provider";

interface CreateNoopModelProviderParams {
  logger: Logger;
}

const FALLBACK_RESPONSE_TEXT =
  "Contextual indexing skipped because no model provider is configured.";

export function createNoopModelProvider({
  logger
}: CreateNoopModelProviderParams): ExternalModelProvider {
  return {
    name: "noop",
    async generate(): Promise<ModelResponse> {
      logger.info(
        "provider:model",
        "Contextual indexing skipped because the model provider is disabled."
      );

      return {
        provider: "noop",
        text: FALLBACK_RESPONSE_TEXT
      };
    }
  };
}
