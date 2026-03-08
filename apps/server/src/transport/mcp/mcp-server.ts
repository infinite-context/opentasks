import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createGoalInputSchema,
  createProjectInputSchema,
  createTaskInputSchema,
  goalListQuerySchema,
  projectListQuerySchema,
  taskActionSchema as sharedTaskActionSchema,
  taskCompletionSchema,
  taskFailureSchema,
  taskReleaseSchema,
  taskRequestSchema,
  updateGoalInputSchema
} from "@opentasks/contracts/schemas";
import type { OperationResultDto } from "@opentasks/contracts";
import type { Logger } from "../../infra/logging";
import type { ExecutionLoop } from "../../system/execution-loop/execution-loop";
import type { GoalService } from "../../system/goal-service";
import type { ProjectService } from "../../system/project-service";
import type { TaskService } from "../../system/task-service";
import type { McpTransport } from "./types";

interface CreateMcpTransportParams {
  logger: Logger;
  appName: string;
  appVersion: string;
  projectService: ProjectService;
  goalService: GoalService;
  taskService: TaskService;
  executionLoop: ExecutionLoop;
}

const requestTaskShape = taskRequestSchema.shape;
const createTaskInputShape = createTaskInputSchema.shape;
const createProjectInputShape = createProjectInputSchema.shape;
const createGoalInputShape = createGoalInputSchema.shape;
const updateGoalInputShape = updateGoalInputSchema.shape;
const projectListQueryShape = projectListQuerySchema.shape;
const goalListQueryShape = goalListQuerySchema.shape;
const taskActionShape = sharedTaskActionSchema.shape;

export function createMcpTransport({
  logger,
  appName,
  appVersion,
  projectService,
  goalService,
  taskService,
  executionLoop
}: CreateMcpTransportParams): McpTransport {
  const server = new McpServer(
    {
      name: appName,
      version: appVersion
    },
    {
      instructions:
        "OpenTasks coordinates project goals and tasks for external agents. Use create_project and create_goal to define work, use create_task to add tasks inside goals, and use request_task only to ask the orchestrator for the next task."
    }
  );
  let transport: StdioServerTransport | null = null;

  server.registerTool(
    "create_project",
    {
      title: "Create Project",
      description: "Create a new project that can own goals and tasks.",
      inputSchema: createProjectInputShape
    },
    async (args) => toToolResult(await projectService.createProject(args))
  );

  server.registerTool(
    "get_project",
    {
      title: "Get Project",
      description: "Load a project by id or key.",
      inputSchema: {
        projectId: z.string().min(1)
      }
    },
    async (args) => toToolResult(await projectService.getProject(args.projectId))
  );

  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description: "List known projects.",
      inputSchema: projectListQueryShape
    },
    async (args) => {
      const result = await projectService.listProjects(args.limit);
      return {
        content: [
          {
            type: "text" as const,
            text: `Loaded ${result.projects.length} project(s).`
          }
        ],
        structuredContent: { ...result }
      };
    }
  );

  server.registerTool(
    "create_goal",
    {
      title: "Create Goal",
      description: "Create a goal inside an existing project.",
      inputSchema: createGoalInputShape
    },
    async (args) => toToolResult(await goalService.createGoal(args))
  );

  server.registerTool(
    "update_goal",
    {
      title: "Update Goal",
      description: "Update goal state or metadata.",
      inputSchema: updateGoalInputShape
    },
    async (args) => toToolResult(await goalService.updateGoal(args))
  );

  server.registerTool(
    "get_goals",
    {
      title: "Get Goals",
      description: "Load all goals for a project.",
      inputSchema: goalListQueryShape
    },
    async (args) => toToolResult(await goalService.getGoals(args.projectId))
  );

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description: "Create a new task inside a project goal.",
      inputSchema: createTaskInputShape
    },
    async (args) => toToolResult(await taskService.createTask(args))
  );

  server.registerTool(
    "request_task",
    {
      title: "Request Task",
      description: "Ask the orchestrator for the next available task in a project.",
      inputSchema: requestTaskShape
    },
    async (args) => toToolResult(await executionLoop.run(args))
  );

  server.registerTool(
    "start_task",
    {
      title: "Start Task",
      description: "Mark an assigned task as in progress for the specified agent.",
      inputSchema: taskActionShape
    },
    async (args) => toToolResult(await taskService.startTask(args.taskId, args.agentName))
  );

  server.registerTool(
    "heartbeat_task",
    {
      title: "Heartbeat Task",
      description: "Renew the lease for a claimed task.",
      inputSchema: {
        ...taskActionShape,
        leaseDurationSeconds: z.number().int().positive().optional()
      }
    },
    async (args) =>
      toToolResult(
        await taskService.renewTaskLease(
          args.taskId,
          args.agentName,
          args.leaseDurationSeconds ?? 900
        )
      )
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: "Mark a claimed task as completed.",
      inputSchema: {
        ...taskActionShape,
        ...taskCompletionSchema.shape
      }
    },
    async (args) =>
      toToolResult(
        await taskService.completeTask(args.taskId, args.agentName, {
          summary: args.summary,
          metadata: args.metadata
        })
      )
  );

  server.registerTool(
    "fail_task",
    {
      title: "Fail Task",
      description: "Mark a claimed task as failed.",
      inputSchema: {
        ...taskActionShape,
        ...taskFailureSchema.shape
      }
    },
    async (args) =>
      toToolResult(
        await taskService.failTask(args.taskId, args.agentName, {
          error: args.error,
          metadata: args.metadata
        })
      )
  );

  server.registerTool(
    "release_task",
    {
      title: "Release Task",
      description: "Release a claimed task back to the queue.",
      inputSchema: {
        ...taskActionShape,
        ...taskReleaseSchema.shape
      }
    },
    async (args) =>
      toToolResult(
        await taskService.releaseTask(args.taskId, args.agentName, {
          reason: args.reason,
          metadata: args.metadata
        })
      )
  );

  server.registerTool(
    "get_task",
    {
      title: "Get Task",
      description: "Load a task and its lifecycle events.",
      inputSchema: {
        taskId: z.string().min(1)
      }
    },
    async (args) => toToolResult(await taskService.getTask(args.taskId))
  );

  return {
    async start(): Promise<void> {
      logger.section("MCP Transport");
      logger.info("transport:mcp", "Starting OpenTasks MCP server over stdio.");

      transport = new StdioServerTransport();
      await server.connect(transport);
    },
    async close(): Promise<void> {
      await server.close();
      if (transport) {
        await transport.close();
      }
    }
  };
}

function toToolResult(result: OperationResultDto) {
  return {
    content: [
      {
        type: "text" as const,
        text: renderMessage(result)
      }
    ],
    structuredContent: {
      status: result.status,
      message: result.message,
      guidance: result.guidance,
      ...(result.context ?? {})
    },
    isError: result.status !== "ok" && result.status !== "no_task_available"
  };
}

function renderMessage(result: OperationResultDto): string {
  if (result.guidance.length === 0) {
    return result.message;
  }

  return `${result.message}\n\nNext steps:\n- ${result.guidance.join("\n- ")}`;
}
