export interface AppEnv {
  appName: string;
  appVersion: string;
  environment: string;
  storageDriver: "memory" | "postgres";
  databaseUrl: string | null;
  autoMigrate: boolean;
  seedDemoData: boolean;
  defaultLeaseDurationSeconds: number;
}

export function loadEnv(): AppEnv {
  const databaseUrl = process.env.OPENTASKS_DATABASE_URL ?? process.env.DATABASE_URL ?? null;

  return {
    appName: process.env.OPENTASKS_APP_NAME ?? "opentasks",
    appVersion: process.env.OPENTASKS_APP_VERSION ?? "0.1.0",
    environment: process.env.NODE_ENV ?? "development",
    storageDriver: resolveStorageDriver(databaseUrl),
    databaseUrl,
    autoMigrate: parseBoolean(process.env.OPENTASKS_AUTO_MIGRATE, true),
    seedDemoData: parseBoolean(process.env.OPENTASKS_SEED_DEMO_DATA, true),
    defaultLeaseDurationSeconds: parseInteger(process.env.OPENTASKS_DEFAULT_LEASE_SECONDS, 900)
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

function resolveStorageDriver(databaseUrl: string | null): "memory" | "postgres" {
  const configuredDriver = process.env.OPENTASKS_STORAGE_DRIVER;

  if (configuredDriver === "memory" || configuredDriver === "postgres") {
    return configuredDriver;
  }

  return databaseUrl ? "postgres" : "memory";
}
