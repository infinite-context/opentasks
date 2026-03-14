import assert from "node:assert/strict";
import test from "node:test";
import { loadEnv } from "./env";

const EMBEDDING_ENV_KEYS = [
  "EMBEDDING_API_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS"
] as const;

test("loadEnv returns default embedding configuration", () => {
  const originalEnv = snapshotEnv();

  try {
    clearEnv();

    const env = loadEnv();

    assert.equal(env.embeddingApiUrl, "https://api.openai.com/v1/embeddings");
    assert.equal(env.embeddingApiKey, null);
    assert.equal(env.embeddingModel, "text-embedding-3-small");
    assert.equal(env.embeddingDimensions, 256);
  } finally {
    restoreEnv(originalEnv);
  }
});

test("loadEnv parses embedding overrides from process env", () => {
  const originalEnv = snapshotEnv();

  try {
    process.env.EMBEDDING_API_URL = "https://embeddings.example.test/v1";
    process.env.EMBEDDING_API_KEY = "secret";
    process.env.EMBEDDING_MODEL = "custom-model";
    process.env.EMBEDDING_DIMENSIONS = "384";

    const env = loadEnv();

    assert.equal(env.embeddingApiUrl, "https://embeddings.example.test/v1");
    assert.equal(env.embeddingApiKey, "secret");
    assert.equal(env.embeddingModel, "custom-model");
    assert.equal(env.embeddingDimensions, 384);
  } finally {
    restoreEnv(originalEnv);
  }
});

function snapshotEnv(): Record<(typeof EMBEDDING_ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(
    EMBEDDING_ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof EMBEDDING_ENV_KEYS)[number], string | undefined>;
}

function clearEnv(): void {
  for (const key of EMBEDDING_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreEnv(snapshot: Record<(typeof EMBEDDING_ENV_KEYS)[number], string | undefined>): void {
  clearEnv();

  for (const key of EMBEDDING_ENV_KEYS) {
    const value = snapshot[key];

    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}
