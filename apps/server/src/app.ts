import { loadEnv } from "./infra/config";
import { createLogger } from "./infra/logging";
import { createOpenRouterProvider } from "./infra/providers/openrouter-provider";
import { createInMemoryTaskStore } from "./infra/storage/in-memory-task-store";
import { createVectorDatabase } from "./infra/storage/vector-database";
import type { CompletedRun, HydratedTask, TaskRequest } from "./shared/types";
import { createContextHydrator } from "./system/context-hydrator";
import { createExecutionLoop } from "./system/execution-loop";
import { createIndexer } from "./system/indexer";
import { createInternalAgent } from "./system/internal-agent";
import { createLearningLoop } from "./system/learning-loop";
import { createModelProviderService } from "./system/model-provider-service";
import { createTaskListManager } from "./system/task-list-manager";
import { createTaskOrchestrator } from "./system/task-orchestrator";
import { createVectorSearchEngine } from "./system/vector-search-engine";
import { createMcpTransport } from "./transport/mcp";

export interface App {
  run(): Promise<void>;
}

export function createApp(): App {
  const env = loadEnv();
  const logger = createLogger();

  const taskStore = createInMemoryTaskStore({ logger });
  const vectorDatabase = createVectorDatabase({ logger });
  const externalModelProvider = createOpenRouterProvider({ logger });

  const taskListManager = createTaskListManager({ logger, taskStore });
  const vectorSearchEngine = createVectorSearchEngine({ logger, vectorDatabase });
  const contextHydrator = createContextHydrator({ logger, vectorSearchEngine });
  const taskOrchestrator = createTaskOrchestrator({
    logger,
    taskListManager,
    contextHydrator
  });

  const modelProviderService = createModelProviderService({
    logger,
    provider: externalModelProvider
  });
  const internalAgent = createInternalAgent({ logger, modelProviderService });
  const indexer = createIndexer({ logger, internalAgent, vectorDatabase });
  const mcpTransport = createMcpTransport({ logger });

  const executionLoop = createExecutionLoop({ logger, mcpTransport, taskOrchestrator });
  const learningLoop = createLearningLoop({ logger, mcpTransport, indexer });

  return {
    async run(): Promise<void> {
      logger.section("Bootstrap");
      logger.info("bootstrap", `Starting ${env.appName} runnable skeleton.`);

      const request: TaskRequest = {
        agentName: env.defaultAgentName,
        projectId: env.defaultProjectId,
        taskHint: "Prepare the next task with hydrated context."
      };

      const hydratedTask: HydratedTask | null = await executionLoop.run(request);

      if (!hydratedTask) {
        logger.section("Done");
        logger.info("bootstrap", "Runnable skeleton completed with no available task.");
        return;
      }

      const completedRun: CompletedRun = {
        taskId: hydratedTask.id,
        projectId: hydratedTask.projectId,
        summary: `Completed placeholder task: ${hydratedTask.title}`,
        outcome: "success"
      };

      await learningLoop.run(completedRun);

      logger.section("Done");
      logger.info("bootstrap", "Runnable skeleton completed.");
    }
  };
}
