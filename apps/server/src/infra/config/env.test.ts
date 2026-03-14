import assert from "node:assert/strict";
import test from "node:test";
import { loadEnv } from "./env";

const EMBEDDING_ENV_KEYS = [
  "EMBEDDING_API_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS"
] as const;

const OPENROUTER_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_API_URL"
] as const;

const CONFIG_ENV_KEYS = [...EMBEDDING_ENV_KEYS, ...OPENROUTER_ENV_KEYS] as const;

test("loadEnv returns default embedding configuration", () => {
  const originalEnv = snapshotEnv();

  try {
    clearEnv();

    const env = loadEnv();

    assert.equal(env.embeddingApiUrl, "https://api.openai.com/v1/embeddings");
    assert.equal(env.embeddingApiKey, null);
    assert.equal(env.embeddingModel, "text-embedding-3-small");
    assert.equal(env.embeddingDimensions, 256);
    assert.equal(env.openrouterApiKey, null);
    assert.equal(env.openrouterModel, "google/gemini-2.0-flash-001");
    assert.equal(env.openrouterApiUrl, "https://openrouter.ai/api/v1/chat/completions");
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

test("loadEnv parses OpenRouter overrides from process env", () => {
  const originalEnv = snapshotEnv();

  try {
    process.env.OPENROUTER_API_KEY = "openrouter-secret";
    process.env.OPENROUTER_MODEL = "openrouter/custom-model";
    process.env.OPENROUTER_API_URL = "https://openrouter.example.test/api/v1/chat/completions";

    const env = loadEnv();

    assert.equal(env.openrouterApiKey, "openrouter-secret");
    assert.equal(env.openrouterModel, "openrouter/custom-model");
    assert.equal(env.openrouterApiUrl, "https://openrouter.example.test/api/v1/chat/completions");
  } finally {
    restoreEnv(originalEnv);
  }
});

function snapshotEnv(): Record<(typeof CONFIG_ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(
    CONFIG_ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof CONFIG_ENV_KEYS)[number], string | undefined>;
}

function clearEnv(): void {
  for (const key of CONFIG_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreEnv(snapshot: Record<(typeof CONFIG_ENV_KEYS)[number], string | undefined>): void {
  clearEnv();

  for (const key of CONFIG_ENV_KEYS) {
    const value = snapshot[key];

    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}
