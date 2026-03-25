import assert from "node:assert/strict";
import test from "node:test";
import { createOllamaEmbeddingProvider } from "./ollama-embedding-provider";
import type { Logger } from "../logging";

test("ollama embedding provider validates the configured model before use", async () => {
  const logger = createSilentLogger();
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];

  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ input, init });

    if (String(input).endsWith("/api/show")) {
      return new Response(JSON.stringify({ details: { family: "embeddinggemma" } }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    return new Response(
      JSON.stringify({
        embeddings: [[0.1, 0.2, 0.3]]
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
    const provider = createOllamaEmbeddingProvider({
      logger,
      baseUrl: "http://localhost:11434/",
      model: "embeddinggemma",
      dimensions: 3
    });

    await provider.validate?.();

    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[0]?.input, "http://localhost:11434/api/show");
    assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
      model: "embeddinggemma"
    });
    assert.equal(fetchCalls[1]?.input, "http://localhost:11434/api/embed");
    assert.deepEqual(JSON.parse(String(fetchCalls[1]?.init?.body)), {
      model: "embeddinggemma",
      input: "OpenTasks embedding provider healthcheck.",
      dimensions: 3
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ollama embedding provider posts to /api/embed and returns the embedding", async () => {
  const logger = createSilentLogger();
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];

  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ input, init });

    return new Response(
      JSON.stringify({
        embeddings: [[0.4, 0.5]]
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
    const provider = createOllamaEmbeddingProvider({
      logger,
      baseUrl: "http://localhost:11434",
      model: "embeddinggemma",
      dimensions: 2
    });

    const embedding = await provider.embed("Represent this task summary.");

    assert.equal(provider.name, "ollama");
    assert.equal(provider.dimensions, 2);
    assert.deepEqual(embedding, [0.4, 0.5]);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.input, "http://localhost:11434/api/embed");
    assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
      model: "embeddinggemma",
      input: "Represent this task summary.",
      dimensions: 2
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ollama embedding provider surfaces actionable setup failures", async () => {
  const logger = createSilentLogger();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response("model 'embeddinggemma' not found", {
      status: 404
    });
  }) as typeof fetch;

  try {
    const provider = createOllamaEmbeddingProvider({
      logger,
      baseUrl: "http://localhost:11434",
      model: "embeddinggemma",
      dimensions: 2
    });

    await assert.rejects(async () => {
      await provider.validate?.();
    }, /ollama pull embeddinggemma/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ollama embedding provider surfaces actionable connectivity failures", async () => {
  const logger = createSilentLogger();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
  }) as typeof fetch;

  try {
    const provider = createOllamaEmbeddingProvider({
      logger,
      baseUrl: "http://localhost:11434",
      model: "embeddinggemma",
      dimensions: 2
    });

    await assert.rejects(async () => {
      await provider.validate?.();
    }, /unable to reach ollama/i);
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
