import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createTaskInputSchema,
  taskActionSchema as sharedTaskActionSchema,
  taskCompletionSchema,
  taskFailureSchema,
  taskReleaseSchema,
  taskRequestSchema
} from "@opentasks/contracts/schemas";
import type { Logger } from "../../infra/logging";
import type { ExecutionLoop } from "../../system/execution-loop";
import type { TaskRuntimeService } from "../../system/task-runtime-service";
import type { McpTransport } from "./types";

interface CreateMcpTransportParams {
  logger: Logger;
  appName: string;
  appVersion: string;
  executionLoop: ExecutionLoop;
  taskRuntimeService: TaskRuntimeService;
}

const requestTaskSchema = taskRequestSchema.shape;
const createTaskInputShape = createTaskInputSchema.shape;
const taskActionSchema = sharedTaskActionSchema.shape;

export function createMcpTransport({
  logger,
  appName,
  appVersion,
  executionLoop,
  taskRuntimeService
}: CreateMcpTransportParams): McpTransport {
  const server = new McpServer(
    {
      name: appName,
      version: appVersion
    },
    {
      instructions:
        "OpenTasks coordinates project tasks for external agents. Use create_task to add new tasks, then the task lifecycle tools to request, start, heartbeat, complete, fail, release, and inspect tasks."
    }
  );
  let transport: StdioServerTransport | null = null;

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description: "Create a new task in a project. The task will be available for agents to claim.",
      inputSchema: createTaskInputShape
    },
    async (args) => {
      const task = await taskRuntimeService.createTask(args);

      if (!task) {
        return {
          content: [
            {
              type: "text",
              text: `Could not create task in project "${args.projectId}". The project may not exist.`
            }
          ],
          structuredContent: {
            task: null
          },
          isError: true
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Created task ${task.id}: "${task.title}".`
          }
        ],
        structuredContent: {
          task
        }
      };
    }
  );

  server.registerTool(
    "request_task",
    {
      title: "Request Task",
      description: "Claim the next available task for an agent from the execution queue.",
      inputSchema: requestTaskSchema
    },
    async (args) => {
      const task = await executionLoop.run(args);

      if (!task) {
        return {
          content: [
            {
              type: "text",
              text: `No task is currently available for project "${args.projectId}".`
            }
          ],
          structuredContent: {
            task: null
          }
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Claimed task ${task.id} for ${task.assignedTo}.`
          }
        ],
        structuredContent: {
          task
        }
      };
    }
  );

  server.registerTool(
    "start_task",
    {
      title: "Start Task",
      description: "Mark an assigned task as in progress for the specified agent.",
      inputSchema: taskActionSchema
    },
    async (args) => taskMutationResult(
      await taskRuntimeService.startTask(args.taskId, args.agentName),
      `Task ${args.taskId} is now in progress.`,
      `Task ${args.taskId} could not be started.`
    )
  );

  server.registerTool(
    "heartbeat_task",
    {
      title: "Heartbeat Task",
      description: "Renew the lease for a claimed task.",
      inputSchema: {
        ...taskActionSchema,
        leaseDurationSeconds: z.number().int().positive().optional()
      }
    },
    async (args) => taskMutationResult(
      await taskRuntimeService.renewTaskLease(
        args.taskId,
        args.agentName,
        args.leaseDurationSeconds ?? 900
      ),
      `Lease renewed for task ${args.taskId}.`,
      `Task ${args.taskId} lease could not be renewed.`
    )
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: "Mark a claimed task as completed.",
      inputSchema: {
        ...taskActionSchema,
        ...taskCompletionSchema.shape
      }
    },
    async (args) => taskMutationResult(
      await taskRuntimeService.completeTask(args.taskId, args.agentName, {
        summary: args.summary,
        metadata: args.metadata
      }),
      `Task ${args.taskId} completed.`,
      `Task ${args.taskId} could not be completed.`
    )
  );

  server.registerTool(
    "fail_task",
    {
      title: "Fail Task",
      description: "Mark a claimed task as failed.",
      inputSchema: {
        ...taskActionSchema,
        ...taskFailureSchema.shape
      }
    },
    async (args) => taskMutationResult(
      await taskRuntimeService.failTask(args.taskId, args.agentName, {
        error: args.error,
        metadata: args.metadata
      }),
      `Task ${args.taskId} marked as failed.`,
      `Task ${args.taskId} could not be marked as failed.`
    )
  );

  server.registerTool(
    "release_task",
    {
      title: "Release Task",
      description: "Release a claimed task back to the queue.",
      inputSchema: {
        ...taskActionSchema,
        ...taskReleaseSchema.shape
      }
    },
    async (args) => taskMutationResult(
      await taskRuntimeService.releaseTask(args.taskId, args.agentName, {
        reason: args.reason,
        metadata: args.metadata
      }),
      `Task ${args.taskId} released back to the queue.`,
      `Task ${args.taskId} could not be released.`
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
    async (args) => {
      const task = await taskRuntimeService.getTask(args.taskId);

      if (!task) {
        return {
          content: [
            {
              type: "text",
              text: `Task ${args.taskId} was not found.`
            }
          ],
          structuredContent: {
            task: null,
            events: []
          }
        };
      }

      const events = await taskRuntimeService.listTaskEvents(args.taskId);

      return {
        content: [
          {
            type: "text",
            text: `Loaded task ${task.id} with ${events.length} lifecycle event(s).`
          }
        ],
        structuredContent: {
          task,
          events
        }
      };
    }
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

function taskMutationResult(
  task: Awaited<ReturnType<TaskRuntimeService["getTask"]>>,
  successText: string,
  failureText: string
) {
  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: failureText
        }
      ],
      structuredContent: {
        task: null
      },
      isError: true
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: successText
      }
    ],
    structuredContent: {
      task
    }
  };
}
