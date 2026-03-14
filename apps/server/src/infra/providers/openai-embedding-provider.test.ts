import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAiEmbeddingProvider } from "./openai-embedding-provider";
import type { Logger } from "../logging";

test("openai embedding provider posts to the configured endpoint and returns the first embedding", async () => {
  const logger = createSilentLogger();
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];

  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ input, init });

    return new Response(
      JSON.stringify({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const provider = createOpenAiEmbeddingProvider({
      logger,
      apiUrl: "https://embeddings.example.test/v1",
      apiKey: "api-key",
      model: "text-embedding-test",
      dimensions: 3
    });

    const embedding = await provider.embed("Represent this task summary.");

    assert.equal(provider.name, "openai-compatible");
    assert.equal(provider.dimensions, 3);
    assert.deepEqual(embedding, [0.1, 0.2, 0.3]);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.input, "https://embeddings.example.test/v1");
    assert.equal(fetchCalls[0]?.init?.method, "POST");
    assert.deepEqual(fetchCalls[0]?.init?.headers, {
      "content-type": "application/json",
      authorization: "Bearer api-key"
    });
    assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
      model: "text-embedding-test",
      input: "Represent this task summary.",
      dimensions: 3
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("openai embedding provider falls back to a zero vector when the request fails", async () => {
  const logMessages: string[] = [];
  const logger: Logger = {
    section() {},
    step() {},
    info(_scope, message) {
      logMessages.push(message);
    }
  };
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response("upstream error", {
      status: 500
    });
  }) as typeof fetch;

  try {
    const provider = createOpenAiEmbeddingProvider({
      logger,
      apiUrl: "https://embeddings.example.test/v1",
      apiKey: null,
      model: "text-embedding-test",
      dimensions: 2
    });

    const embedding = await provider.embed("Represent this task summary.");

    assert.deepEqual(embedding, [0, 0]);
    assert.equal(logMessages.length, 1);
    assert.match(logMessages[0] ?? "", /returning a zero vector/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createSilentLogger(): Logger {
  return {
    section() {},
    step() {},
    info() {}
  };
}
