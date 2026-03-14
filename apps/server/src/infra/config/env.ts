export interface AppEnv {
  appName: string;
  appVersion: string;
  environment: string;
  mcpEnabled: boolean;
  mcpOverHttp: boolean;
  embeddingApiUrl: string;
  embeddingApiKey: string | null;
  embeddingModel: string;
  embeddingDimensions: number;
  storageDriver: "memory" | "sqlite";
  databaseUrl: string | null;
  autoMigrate: boolean;
  defaultLeaseDurationSeconds: number;
  httpEnabled: boolean;
  httpPort: number;
}

export function loadEnv(): AppEnv {
  const databaseUrl = process.env.OPENTASKS_DATABASE_URL ?? process.env.DATABASE_URL ?? "./data/opentasks.db";

  return {
    appName: process.env.OPENTASKS_APP_NAME ?? "opentasks",
    appVersion: process.env.OPENTASKS_APP_VERSION ?? "0.1.0",
    environment: process.env.NODE_ENV ?? "development",
    mcpEnabled: parseBoolean(process.env.OPENTASKS_MCP_ENABLED, true),
    mcpOverHttp: parseBoolean(process.env.OPENTASKS_MCP_OVER_HTTP, true),
    embeddingApiUrl: process.env.EMBEDDING_API_URL ?? "https://api.openai.com/v1/embeddings",
    embeddingApiKey: process.env.EMBEDDING_API_KEY ?? null,
    embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    embeddingDimensions: parseInteger(process.env.EMBEDDING_DIMENSIONS, 256),
    storageDriver: resolveStorageDriver(databaseUrl),
    databaseUrl,
    autoMigrate: parseBoolean(process.env.OPENTASKS_AUTO_MIGRATE, true),
    defaultLeaseDurationSeconds: parseInteger(process.env.OPENTASKS_DEFAULT_LEASE_SECONDS, 900),
    httpEnabled: parseBoolean(process.env.OPENTASKS_HTTP_ENABLED, true),
    httpPort: parseInteger(process.env.OPENTASKS_HTTP_PORT, 3005)
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveStorageDriver(databaseUrl: string | null): "memory" | "sqlite" {
  const configuredDriver = process.env.OPENTASKS_STORAGE_DRIVER;

  if (configuredDriver === "memory" || configuredDriver === "sqlite") {
    return configuredDriver;
  }

  return databaseUrl ? "sqlite" : "memory";
}
