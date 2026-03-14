import assert from "node:assert/strict";
import test from "node:test";
import { createNoopEmbeddingProvider } from "./noop-embedding-provider";
import type { Logger } from "../logging";

test("noop embedding provider returns a zero vector with the configured dimensions", async () => {
  const logMessages: string[] = [];
  const logger: Logger = {
    section() {},
    step() {},
    info(_scope, message) {
      logMessages.push(message);
    }
  };

  const provider = createNoopEmbeddingProvider({
    logger,
    dimensions: 4
  });

  const embedding = await provider.embed("Summarize a finished task.");

  assert.equal(provider.name, "noop");
  assert.equal(provider.dimensions, 4);
  assert.deepEqual(embedding, [0, 0, 0, 0]);
  assert.equal(logMessages.length, 1);
  assert.match(logMessages[0] ?? "", /zero vector/i);
});
