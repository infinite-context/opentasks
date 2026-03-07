import type { Logger } from "../../infra/logging";
import type { HydratedTask, TaskRequest } from "../../shared/types";
import type { TaskOrchestrator } from "../task-orchestrator";
import type { McpTransport } from "../../transport/mcp";

export interface ExecutionLoop {
  run(request: TaskRequest): Promise<HydratedTask>;
}

interface CreateExecutionLoopParams {
  logger: Logger;
  mcpTransport: McpTransport;
  taskOrchestrator: TaskOrchestrator;
}

export function createExecutionLoop({
  logger,
  mcpTransport,
  taskOrchestrator
}: CreateExecutionLoopParams): ExecutionLoop {
  return {
    async run(request: TaskRequest): Promise<HydratedTask> {
      logger.section("Execution Loop");

      const taskRequest = await mcpTransport.receiveTaskRequest(request);

      logger.step("execution-loop", "MCP server forwards the task request to the task orchestrator.");
      const hydratedTask = await taskOrchestrator.prepareTask(taskRequest);

      await mcpTransport.returnHydratedTask(hydratedTask);
      logger.step(
        "execution-loop",
        `Execution loop completes after preparing task \"${hydratedTask.id}\" for the external agent.`
      );

      return hydratedTask;
    }
  };
}
