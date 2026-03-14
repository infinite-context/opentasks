import type { Logger } from "../logging";
import type { ModelRequest, ModelResponse } from "@opentasks/contracts";
import type { ExternalModelProvider } from "./external-model-provider";

interface CreateOpenRouterProviderParams {
  logger: Logger;
  apiKey: string | null;
  model: string;
  apiUrl: string;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const FALLBACK_RESPONSE_TEXT =
  "Contextual indexing skipped because the model provider request failed.";

export function createOpenRouterProvider({
  logger,
  apiKey,
  model,
  apiUrl
}: CreateOpenRouterProviderParams): ExternalModelProvider {
  return {
    name: "openrouter",
    async generate(request: ModelRequest): Promise<ModelResponse> {
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json"
        };

        if (apiKey) {
          headers.authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: request.prompt
              }
            ]
          })
        });

        if (!response.ok) {
          const responseBody = await response.text();
          throw new Error(
            `OpenRouter request failed with ${response.status}: ${responseBody || "empty response body"}`
          );
        }

        const payload = (await response.json()) as OpenRouterResponse;
        const text = payload.choices?.[0]?.message?.content;

        if (typeof text !== "string" || text.trim().length === 0) {
          throw new Error("OpenRouter response did not include a completion message.");
        }

        return {
          provider: "openrouter",
          text
        };
      } catch (error) {
        logger.info(
          "provider:openrouter",
          `OpenRouter request failed. Returning fallback response. ${error instanceof Error ? error.message : String(error)}`
        );

        return {
          provider: "openrouter",
          text: FALLBACK_RESPONSE_TEXT
        };
      }
    }
  };
}
