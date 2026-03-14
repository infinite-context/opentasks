import type { Logger } from "../logging";
import type { EmbeddingProvider } from "./embedding-provider";

interface CreateOpenAiEmbeddingProviderParams {
  logger: Logger;
  apiUrl: string;
  apiKey: string | null;
  model: string;
  dimensions: number;
}

interface OpenAiEmbeddingsResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

export function createOpenAiEmbeddingProvider({
  logger,
  apiUrl,
  apiKey,
  model,
  dimensions
}: CreateOpenAiEmbeddingProviderParams): EmbeddingProvider {
  return {
    name: "openai-compatible",
    dimensions,
    async embed(text: string): Promise<number[]> {
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
            input: text,
            dimensions
          })
        });

        if (!response.ok) {
          const responseBody = await response.text();
          throw new Error(
            `Embedding request failed with ${response.status}: ${responseBody || "empty response body"}`
          );
        }

        const payload = (await response.json()) as OpenAiEmbeddingsResponse;
        const embedding = payload.data?.[0]?.embedding;

        if (!Array.isArray(embedding)) {
          throw new Error("Embedding response did not include a vector payload.");
        }

        return embedding;
      } catch (error) {
        logger.info(
          "provider:embedding",
          `Embedding request failed. Returning a zero vector. ${error instanceof Error ? error.message : String(error)}`
        );

        return createZeroVector(dimensions);
      }
    }
  };
}

function createZeroVector(dimensions: number): number[] {
  return Array.from({ length: dimensions }, () => 0);
}
