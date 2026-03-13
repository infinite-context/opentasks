import { createMcpStdioTransport } from "./mcp-stdio.js";
import type { McpTransport } from "./types.js";
import type { Logger } from "../../infra/logging";
import type { AgentService } from "../../system/agent-service";
import type { DashboardQueryService } from "../../system/dashboard-query-service";
import type { ExecutionLoop } from "../../system/execution-loop/execution-loop";
import type { GoalService } from "../../system/goal-service";
import type { ProjectService } from "../../system/project-service";
import type { SessionService } from "../../system/session-service";
import type { TaskService } from "../../system/task-service";
import type { TaskQueryService } from "../../system/task-query-service";
import type { TaskResolutionService } from "../../system/task-resolution-service";

import type { McpLogStore } from "../../infra/storage/mcp-log-store";

interface CreateMcpTransportParams {
  logger: Logger;
  appName: string;
  appVersion: string;
  projectService: ProjectService;
  sessionService: SessionService;
  goalService: GoalService;
  taskService: TaskService;
  executionLoop: ExecutionLoop;
  taskQueryService: TaskQueryService;
  taskResolutionService: TaskResolutionService;
  dashboardQueryService: DashboardQueryService;
  agentService: AgentService;
  mcpLogStore?: McpLogStore;
}

export function createMcpTransport(params: CreateMcpTransportParams): McpTransport {
  return createMcpStdioTransport(params);
}
