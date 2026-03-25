import type { Logger } from "../logging";
import type { EmbeddingProvider } from "./embedding-provider";

interface CreateOllamaEmbeddingProviderParams {
  logger: Logger;
  baseUrl: string;
  model: string;
  dimensions: number;
}

interface OllamaEmbedResponse {
  embedding?: number[];
  embeddings?: number[][] | number[];
}

export function createOllamaEmbeddingProvider({
  logger,
  baseUrl,
  model,
  dimensions
}: CreateOllamaEmbeddingProviderParams): EmbeddingProvider {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    name: "ollama",
    dimensions,
    async validate(): Promise<void> {
      await assertModelInstalled(normalizedBaseUrl, model);

      const embedding = await requestEmbedding({
        baseUrl: normalizedBaseUrl,
        model,
        dimensions,
        text: "OpenTasks embedding provider healthcheck."
      });

      if (embedding.length !== dimensions) {
        throw new Error(
          `Ollama returned ${embedding.length} dimensions for model ${model}, expected ${dimensions}.`
        );
      }

      logger.info(
        "provider:embedding",
        `Validated Ollama embeddings with model ${model} at ${normalizedBaseUrl}.`
      );
    },
    async embed(text: string): Promise<number[]> {
      return requestEmbedding({
        baseUrl: normalizedBaseUrl,
        model,
        dimensions,
        text
      });
    }
  };
}

async function assertModelInstalled(baseUrl: string, model: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model
      })
    });
  } catch (error) {
    throw new Error(
      [
        `Unable to reach Ollama at ${baseUrl}.`,
        error instanceof Error ? error.message : String(error),
        `Ensure Ollama is running and install the model with: ollama pull ${model}`
      ].join(" ")
    );
  }

  if (!response.ok) {
    const responseBody = await response.text();

    throw new Error(
      [
        `Unable to load Ollama model ${model} from ${baseUrl}.`,
        responseBody || `HTTP ${response.status}.`,
        `Ensure Ollama is running and install the model with: ollama pull ${model}`
      ].join(" ")
    );
  }
}

async function requestEmbedding({
  baseUrl,
  model,
  dimensions,
  text
}: {
  baseUrl: string;
  model: string;
  dimensions: number;
  text: string;
}): Promise<number[]> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: text,
        dimensions
      })
    });
  } catch (error) {
    throw new Error(
      [
        `Unable to reach Ollama at ${baseUrl}.`,
        error instanceof Error ? error.message : String(error),
        `Ensure Ollama is running and install the model with: ollama pull ${model}`
      ].join(" ")
    );
  }

  if (!response.ok) {
    const responseBody = await response.text();

    throw new Error(
      [
        `Ollama embedding request failed for model ${model} at ${baseUrl}.`,
        responseBody || `HTTP ${response.status}.`,
        `Ensure Ollama is running and install the model with: ollama pull ${model}`
      ].join(" ")
    );
  }

  const payload = (await response.json()) as OllamaEmbedResponse;
  const embedding = resolveEmbeddingVector(payload);

  if (!Array.isArray(embedding) || !embedding.every((value) => Number.isFinite(value))) {
    throw new Error("Ollama embedding response did not include a valid embedding vector.");
  }

  return embedding;
}

function resolveEmbeddingVector(payload: OllamaEmbedResponse): number[] | undefined {
  if (Array.isArray(payload.embedding)) {
    return payload.embedding;
  }

  if (Array.isArray(payload.embeddings)) {
    const [first] = payload.embeddings;

    if (Array.isArray(first)) {
      return first;
    }

    if (payload.embeddings.every((value) => typeof value === "number")) {
      return payload.embeddings as number[];
    }
  }

  return undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
