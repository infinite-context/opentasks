import assert from "node:assert/strict";
import test from "node:test";
import { createOpenRouterProvider } from "./openrouter-provider";
import type { Logger } from "../logging";

test("openrouter provider posts to the configured endpoint and returns the first completion", async () => {
  const logger = createSilentLogger();
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];

  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ input, init });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "Reusable context generated from the run."
            }
          }
        ]
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
    const provider = createOpenRouterProvider({
      logger,
      apiKey: "openrouter-key",
      model: "google/gemini-2.0-flash-001",
      apiUrl: "https://openrouter.example.test/api/v1/chat/completions"
    });

    const response = await provider.generate({
      prompt: "Summarize reusable context for a completed task."
    });

    assert.equal(provider.name, "openrouter");
    assert.deepEqual(response, {
      provider: "openrouter",
      text: "Reusable context generated from the run."
    });
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.input, "https://openrouter.example.test/api/v1/chat/completions");
    assert.equal(fetchCalls[0]?.init?.method, "POST");
    assert.deepEqual(fetchCalls[0]?.init?.headers, {
      "content-type": "application/json",
      authorization: "Bearer openrouter-key"
    });
    assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
      model: "google/gemini-2.0-flash-001",
      messages: [
        {
          role: "user",
          content: "Summarize reusable context for a completed task."
        }
      ]
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("openrouter provider falls back to a safe response when the request fails", async () => {
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
      status: 502
    });
  }) as typeof fetch;

  try {
    const provider = createOpenRouterProvider({
      logger,
      apiKey: null,
      model: "google/gemini-2.0-flash-001",
      apiUrl: "https://openrouter.example.test/api/v1/chat/completions"
    });

    const response = await provider.generate({
      prompt: "Summarize reusable context for a completed task."
    });

    assert.deepEqual(response, {
      provider: "openrouter",
      text: "Contextual indexing skipped because the model provider request failed."
    });
    assert.equal(logMessages.length, 1);
    assert.match(logMessages[0] ?? "", /fallback response/i);
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
