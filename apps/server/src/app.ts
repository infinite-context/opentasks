import { Pool } from "pg";
import { loadEnv } from "./infra/config";
import { createLogger } from "./infra/logging";
import { createInMemoryTaskStore } from "./infra/storage/in-memory-task-store";
import { createPostgresTaskDatabase } from "./infra/storage/postgres-task-database";
import { applyPostgresSchema, seedPostgresDemoData } from "./infra/storage/postgres-schema";
import { createDashboardQueryService } from "./system/dashboard-query-service";
import { createExecutionLoop } from "./system/execution-loop";
import { createTaskListManager } from "./system/task-list-manager";
import { createTaskOrchestrator } from "./system/task-orchestrator";
import { createTaskQueryService } from "./system/task-query-service";
import { createTaskRuntimeService } from "./system/task-runtime-service";
import { createHttpTransport } from "./transport/http";
import { createMcpTransport } from "./transport/mcp";

export interface App {
  run(): Promise<void>;
}

export function createApp(): App {
  const env = loadEnv();
  const logger = createLogger();
  const pool =
    env.storageDriver === "postgres" && env.databaseUrl
      ? new Pool({ connectionString: env.databaseUrl })
      : null;
  const taskStore =
    env.storageDriver === "postgres" && pool
      ? createPostgresTaskDatabase({ logger, pool })
      : createInMemoryTaskStore({ logger });

  const taskListManager = createTaskListManager({ logger, taskStore });
  const taskOrchestrator = createTaskOrchestrator({
    logger,
    taskListManager,
    defaultLeaseDurationSeconds: env.defaultLeaseDurationSeconds
  });
  const executionLoop = createExecutionLoop({ logger, taskOrchestrator });
  const taskRuntimeService = createTaskRuntimeService({
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
        executionLoop,
        taskRuntimeService
      })
    : null;
  const httpTransport = env.httpEnabled
    ? createHttpTransport({
        logger,
        appName: env.appName,
        appVersion: env.appVersion,
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

      if (pool) {
        if (env.autoMigrate) {
          await applyPostgresSchema(pool, logger);
        }

        if (env.seedDemoData) {
          await seedPostgresDemoData(pool, logger);
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
      await pool?.end();
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
