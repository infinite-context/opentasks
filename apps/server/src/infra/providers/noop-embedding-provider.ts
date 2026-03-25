import type { Logger } from "../logging";
import type { EmbeddingProvider } from "./embedding-provider";

interface CreateNoopEmbeddingProviderParams {
  logger: Logger;
  dimensions: number;
}

export function createNoopEmbeddingProvider({
  logger,
  dimensions
}: CreateNoopEmbeddingProviderParams): EmbeddingProvider {
  return {
    name: "noop",
    dimensions,
    async validate(): Promise<void> {
      logger.info(
        "provider:embedding",
        "Using noop embeddings. Retrieval quality checks are disabled in this mode."
      );
    },
    async embed(): Promise<number[]> {
      logger.info(
        "provider:embedding",
        "Embedding provider is disabled. Returning a zero vector."
      );

      return createZeroVector(dimensions);
    }
  };
}

function createZeroVector(dimensions: number): number[] {
  return Array.from({ length: dimensions }, () => 0);
}
