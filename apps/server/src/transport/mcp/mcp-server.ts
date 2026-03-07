import type { Logger } from "../../infra/logging";
import type { CompletedRun, HydratedTask, TaskRequest } from "../../shared/types";
import type { McpTransport } from "./types";

interface CreateMcpTransportParams {
  logger: Logger;
}

export function createMcpTransport({ logger }: CreateMcpTransportParams): McpTransport {
  return {
    async receiveTaskRequest(request: TaskRequest): Promise<TaskRequest> {
      logger.step("transport:mcp", "External agent requests a task through the MCP server.");
      return request;
    },
    async returnHydratedTask(task: HydratedTask): Promise<void> {
      logger.step(
        "transport:mcp",
        `MCP server returns hydrated task \"${task.title}\" to the external agent.`
      );
    },
    async receiveCompletedRun(run: CompletedRun): Promise<CompletedRun> {
      logger.step(
        "transport:mcp",
        "External agent submits completed run context through the MCP server."
      );
      return run;
    }
  };
}
