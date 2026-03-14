import assert from "node:assert/strict";
import test from "node:test";
import { createNoopModelProvider } from "./noop-model-provider";
import type { Logger } from "../logging";

test("noop model provider logs and returns a safe fallback response", async () => {
  const logMessages: string[] = [];
  const logger: Logger = {
    section() {},
    step() {},
    info(_scope, message) {
      logMessages.push(message);
    }
  };

  const provider = createNoopModelProvider({ logger });
  const response = await provider.generate({
    prompt: "Summarize reusable context for a completed task."
  });

  assert.equal(provider.name, "noop");
  assert.deepEqual(response, {
    provider: "noop",
    text: "Contextual indexing skipped because no model provider is configured."
  });
  assert.equal(logMessages.length, 1);
  assert.match(logMessages[0] ?? "", /disabled/i);
});
