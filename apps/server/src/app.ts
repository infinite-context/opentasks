import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cwd as getCwd } from "node:process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./infra/config";
import { createLogger } from "./infra/logging";
import { createInMemoryTaskStore } from "./infra/storage/in-memory-task-store";
import { createSqliteTaskDatabase } from "./infra/storage/sqlite-task-database";
import { applySqliteSchema, seedSqliteDemoData } from "./infra/storage/sqlite-schema";
import { createDashboardQueryService } from "./system/dashboard-query-service";
import { createTaskService } from "./system/task-service";
import { createTaskQueryService } from "./system/task-query-service";
import { createHttpTransport } from "./transport/http";
import { createMcpTransport } from "./transport/mcp";

import type { AppEnv } from "./infra/config";

export interface App {
  run(): Promise<void>;
}

export function createApp(overrides?: Partial<AppEnv>): App {
  const env = { ...loadEnv(), ...overrides };
  const logger = createLogger();
  let db: Database.Database | null = null;
  if (env.storageDriver === "sqlite" && env.databaseUrl) {
    try {
      // Resolve the database path relative to the .env file location (apps/server)
      // to ensure all processes use the exact same file regardless of where they are started from.
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const dbPath = resolve(__dirname, "../../", env.databaseUrl);
      
      mkdirSync(dirname(dbPath), { recursive: true });
      db = new Database(dbPath);
      logger.info("bootstrap", `Connected to SQLite database at ${dbPath}`);
    } catch (err) {
      logger.info("bootstrap", `Failed to initialize SQLite database at ${env.databaseUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (env.storageDriver === "sqlite" && !db) {
    logger.info("bootstrap", "SQLite storage driver requested but no database URL provided. Falling back to memory storage.");
    env.storageDriver = "memory";
  }

  const taskStore =
    env.storageDriver === "sqlite" && db
      ? createSqliteTaskDatabase({ logger, db })
      : createInMemoryTaskStore({ logger });

  const taskService = createTaskService({
    logger,
    taskStore,
    defaultLeaseDurationSeconds: env.defaultLeaseDurationSeconds
  });

  const taskQueryService = createTaskQueryService({
    logger,
    taskStore
  });
  const dashboardQueryService = createDashboardQueryService({
    logger,
    taskStore
  });
  const mcpTransport = env.mcpEnabled
    ? createMcpTransport({
        logger,
        appName: env.appName,
        appVersion: env.appVersion,
        taskService
      })
    : null;
  const projectPath = process.env.OPENTASKS_PROJECT_PATH ?? getCwd();
  const httpTransport = env.httpEnabled
    ? createHttpTransport({
        logger,
        appName: env.appName,
        appVersion: env.appVersion,
        projectPath,
        port: env.httpPort,
        dashboardQueryService,
        taskQueryService
      })
    : null;

  return {
    async run(): Promise<void> {
      logger.section("Bootstrap");
      logger.info("bootstrap", `Starting ${env.appName} backend in ${env.environment} mode.`);
      logger.info("bootstrap", `Using ${env.storageDriver} task storage.`);

      if (db) {
        if (env.autoMigrate) {
          applySqliteSchema(db, logger);
        }

        if (env.seedDemoData) {
          seedSqliteDemoData(db, logger);
        }
      }

      if (mcpTransport) {
        await mcpTransport.start();
      }
      if (httpTransport) {
        await httpTransport.start();
      }
      if (mcpTransport) {
        logger.info("bootstrap", "OpenTasks MCP server is ready for task lifecycle requests.");
      }
      if (httpTransport) {
        logger.info("bootstrap", "OpenTasks HTTP server is ready for dashboard requests.");
      }

      await waitForShutdownSignal();
      await httpTransport?.close();
      await mcpTransport?.close();
      db?.close();
    }
  };
}

async function waitForShutdownSignal(): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;

    const handleSignal = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
  });
}
