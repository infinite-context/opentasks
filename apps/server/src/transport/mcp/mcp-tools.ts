import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createGoalInputSchema,
  createTaskInputSchema,
  dashboardQuerySchema,
  goalListQuerySchema,
  projectListQuerySchema,
  startSessionInputSchema,
  submitRunContextInputSchema,
  submitTaskContextInputSchema,
  taskActionSchema as sharedTaskActionSchema,
  taskClaimByIdSchema,
  taskCompletionSchema,
  taskFailureSchema,
  taskListQuerySchema,
  taskSearchQuerySchema,
  taskReleaseSchema,
  taskRequestSchema,
  updateGoalInputSchema,
  updateProjectInputSchema
} from "@opentasks/contracts/schemas";
import type {
  ClientRuntimeCapability,
  OperationResultDto
} from "@opentasks/contracts";
import type { McpLogStore } from "../../infra/storage/mcp-log-store";
import type { AgentService } from "../../system/agent-service";
import type { DashboardQueryService } from "../../system/dashboard-query-service";
import type { ExecutionLoop } from "../../system/execution-loop/execution-loop";
import type { GoalService } from "../../system/goal-service";
import type { LearningLoop } from "../../system/learning-loop";
import { buildCompletedRun } from "../../system/learning-loop/completed-run";
import type { ProjectService } from "../../system/project-service";
import type { SessionService } from "../../system/session-service";
import type { TaskService } from "../../system/task-service";
import type { TaskQueryService } from "../../system/task-query-service";
import type { TaskResolutionService } from "../../system/task-resolution-service";

export interface McpToolsServices {
  projectService: ProjectService;
  sessionService: SessionService;
  goalService: GoalService;
  taskService: TaskService;
  executionLoop: ExecutionLoop;
  taskQueryService: TaskQueryService;
  taskResolutionService: TaskResolutionService;
  dashboardQueryService: DashboardQueryService;
  learningLoop?: LearningLoop | null;
}

export interface ToolRequestExtra {
  sessionId?: string;
  requestInfo?: { headers?: Record<string, string | string[] | undefined> };
}

/**
 * Resolves the agent identity for the current request. Used by task lifecycle tools.
 * For session-bound transports (HTTP), this returns the session's agent using extra.sessionId
 * or extra.requestInfo.headers['mcp-session-id'].
 * For stdio, this may return a caller-supplied value during migration.
 */
export type GetAgentForRequest = (
  args: { agentName?: string },
  extra?: ToolRequestExtra
) => Promise<string>;

export type GetClientCapabilityForRequest = (extra?: ToolRequestExtra) => Promise<ClientRuntimeCapability>;
export type SetClientCapabilityForRequest = (
  capability: ClientRuntimeCapability,
  extra?: ToolRequestExtra
) => Promise<void>;

export interface RegisterMcpToolsParams extends McpToolsServices {
  getAgentForRequest: GetAgentForRequest;
  getClientCapabilityForRequest: GetClientCapabilityForRequest;
  setClientCapabilityForRequest: SetClientCapabilityForRequest;
  logStore?: McpLogStore;
  agentService?: AgentService;
}

const startSessionInputShape = startSessionInputSchema.shape;
const requestTaskShape = taskRequestSchema.shape;
const createTaskInputShape = createTaskInputSchema.shape;
const updateProjectInputShape = updateProjectInputSchema.shape;
const createGoalInputShape = createGoalInputSchema.shape;
const updateGoalInputShape = updateGoalInputSchema.shape;
const projectListQueryShape = projectListQuerySchema.shape;
const goalListQueryShape = goalListQuerySchema.shape;
const taskListQueryShape = taskListQuerySchema.shape;
const taskSearchQueryShape = taskSearchQuerySchema.shape;
const dashboardQueryShape = dashboardQuerySchema.shape;
const taskActionShape = sharedTaskActionSchema.shape;
const taskClaimByIdShape = taskClaimByIdSchema.shape;
const submitTaskContextInputShape = submitTaskContextInputSchema.shape;
const submitRunContextInputShape = submitRunContextInputSchema.shape;

function withLogging<TArgs, TExtra>(
  toolName: string,
  handler: (args: TArgs, extra?: TExtra) => Promise<unknown>,
  getAgentForRequest: GetAgentForRequest,
  logStore: McpLogStore | undefined,
  agentService: AgentService | undefined
) {
  const shouldLog = logStore || agentService;
  if (!shouldLog) {
    return handler;
  }
  return async (args: TArgs, extra?: TExtra) => {
    let agentDisplayName: string | null = null;
    try {
      agentDisplayName = await getAgentForRequest(args as { agentName?: string }, extra as { sessionId?: string; requestInfo?: { headers?: Record<string, string | string[] | undefined> } });
    } catch {
      agentDisplayName = (args as { agentName?: string }).agentName ?? null;
    }
    const touchAgent = () => {
      if (agentDisplayName && agentService) {
        void agentService.touchLastSeenByDisplayName(agentDisplayName);
      }
    };
    try {
      const result = await handler(args, extra);
      touchAgent();
      if (logStore) {
        let resultJson: string | null = null;
        try {
          resultJson = JSON.stringify(result);
        } catch {
          resultJson = String(result);
        }
        await logStore.insertLog({
          agentDisplayName,
          toolName,
          args: args as Record<string, unknown>,
          resultStatus: "ok",
          resultJson
        });
      }
      return result;
    } catch (err) {
      touchAgent();
      if (logStore) {
        await logStore.insertLog({
          agentDisplayName,
          toolName,
          args: args as Record<string, unknown>,
          resultStatus: "error",
          errorMessage: err instanceof Error ? err.message : String(err)
        });
      }
      throw err;
    }
  };
}

export function registerMcpTools(
  server: McpServer,
  { getAgentForRequest, logStore, agentService, ...services }: RegisterMcpToolsParams
): void {
  const {
    projectService,
    sessionService,
    goalService,
    taskService,
    executionLoop,
    taskQueryService,
    taskResolutionService,
    dashboardQueryService,
    learningLoop,
    getClientCapabilityForRequest,
    setClientCapabilityForRequest
  } = services;

  const wrap = <TArgs, TExtra>(
    toolName: string,
    handler: (args: TArgs, extra?: TExtra) => Promise<unknown>
  ) => withLogging(toolName, handler, getAgentForRequest, logStore, agentService);

  server.registerTool(
    "start_session",
    {
      title: "Start Session",
      description:
        "Start or resume a session for a working directory. Call this first with your current working directory root (project/workspace path). Returns the projectId for an existing project (exact or parent path match) or creates a new project.",
      inputSchema: startSessionInputShape
    },
    wrap("start_session", async (args, extra) => {
      const clientCapability = args.client?.capability ?? "black_box";
      await setClientCapabilityForRequest(clientCapability, extra);
      return toToolResult(await sessionService.startSession(args.workingDirectory, clientCapability));
    })
  );

  server.registerTool(
    "update_project",
    {
      title: "Update Project",
      description:
        "Update a project's description. projectId accepts id, key, name, or working directory.",
      inputSchema: updateProjectInputShape
    },
    wrap("update_project", async (args) => toToolResult(await projectService.updateProject(args)))
  );

  server.registerTool(
    "get_project",
    {
      title: "Get Project",
      description:
        "Load a project by id, key, name, or working directory. The projectId parameter accepts any of these.",
      inputSchema: {
        projectId: z.string().min(1).describe("Project id, key, name, or working directory path")
      }
    },
    wrap("get_project", async (args) => toToolResult(await projectService.getProject(args.projectId)))
  );

  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description: "List known projects.",
      inputSchema: projectListQueryShape
    },
    wrap("list_projects", async (args) => {
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
    })
  );

  server.registerTool(
    "create_goal",
    {
      title: "Create Goal",
      description:
        "Create a goal inside an existing project. projectId accepts id, key, name, or working directory.",
      inputSchema: createGoalInputShape
    },
    wrap("create_goal", async (args) => toToolResult(await goalService.createGoal(args)))
  );

  server.registerTool(
    "update_goal",
    {
      title: "Update Goal",
      description: "Update goal state or metadata.",
      inputSchema: updateGoalInputShape
    },
    wrap("update_goal", async (args) => toToolResult(await goalService.updateGoal(args)))
  );

  server.registerTool(
    "get_goals",
    {
      title: "Get Goals",
      description:
        "Load all goals for a project. projectId accepts id, key, name, or working directory.",
      inputSchema: goalListQueryShape
    },
    wrap("get_goals", async (args) => toToolResult(await goalService.getGoals(args.projectId)))
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description:
        "List tasks using project, goal, status, assignment, or limit filters. projectId accepts id, key, name, or working directory.",
      inputSchema: taskListQueryShape
    },
    wrap("list_tasks", async (args) => {
      const result = await taskQueryService.listTasks(args);
      return {
        content: [
          {
            type: "text" as const,
            text: `Loaded ${result.tasks.length} task(s).`
          }
        ],
        structuredContent: { ...result }
      };
    })
  );

  server.registerTool(
    "search_tasks",
    {
      title: "Search Tasks",
      description:
        "Search tasks by title and description using a text query and optional filters. projectId accepts id, key, name, or working directory.",
      inputSchema: taskSearchQueryShape
    },
    wrap("search_tasks", async (args) => {
      const result = await taskQueryService.searchTasks(args);
      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${result.results.length} task(s) matching \"${result.query}\".`
          }
        ],
        structuredContent: { ...result }
      };
    })
  );

  server.registerTool(
    "recommend_task_for_query",
    {
      title: "Recommend Task For Query",
      description:
        "Recommend the best executable task for a text query without claiming it. projectId accepts id, key, name, or working directory.",
      inputSchema: taskSearchQueryShape
    },
    wrap("recommend_task_for_query", async (args) => {
      const result = await taskResolutionService.recommendTaskForQuery(args);
      const summary = result.recommendedTask
        ? `Recommended task ${result.recommendedTask.id}: ${result.recommendedTask.title}.`
        : `No claimable task recommendation found for "${result.query}".`;

      return {
        content: [
          {
            type: "text" as const,
            text: summary
          }
        ],
        structuredContent: { ...result }
      };
    })
  );

  server.registerTool(
    "get_project_overview",
    {
      title: "Get Project Overview",
      description:
        "Load a project overview snapshot including summary, pipeline, tasks, activity, agents, and health. projectId accepts id, key, name, or working directory.",
      inputSchema: dashboardQueryShape
    },
    wrap("get_project_overview", async (args) => {
      const result = await dashboardQueryService.getSnapshot(args);
      const projectName = result.project?.name ?? result.project?.key ?? args.projectId ?? "current scope";

      return {
        content: [
          {
            type: "text" as const,
            text: `Loaded project overview for ${projectName}.`
          }
        ],
        structuredContent: { ...result }
      };
    })
  );

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description:
        "Create a new task inside a project goal. projectId accepts id, key, name, or working directory.",
      inputSchema: createTaskInputShape
    },
    wrap("create_task", async (args) => toToolResult(await taskService.createTask(args)))
  );

  server.registerTool(
    "request_task",
    {
      title: "Request Task",
      description:
        "Ask the orchestrator for the next available task in a project. projectId accepts id, key, name, or working directory.",
      inputSchema: requestTaskShape
    },
    wrap("request_task", async (args, extra) => {
      const agentName = await getAgentForRequest(args, extra);
      return toToolResult(
        await executionLoop.run({
          ...args,
          agentName
        })
      );
    })
  );

  server.registerTool(
    "claim_task_by_id",
    {
      title: "Claim Task By Id",
      description:
        "Claim a specific available task by id if it is dependency-ready and belongs to an active goal.",
      inputSchema: taskClaimByIdShape
    },
    wrap("claim_task_by_id", async (args, extra) => {
      const agentName = await getAgentForRequest(args, extra);
      return toToolResult(
        await taskService.claimTaskById(
          args.taskId,
          agentName,
          args.leaseDurationSeconds
        )
      );
    })
  );

  server.registerTool(
    "start_task",
    {
      title: "Start Task",
      description: "Mark an assigned task as in progress for the specified agent.",
      inputSchema: taskActionShape
    },
    wrap("start_task", async (args, extra) => {
      const agentName = await getAgentForRequest(args, extra);
      return toToolResult(await taskService.startTask(args.taskId, agentName));
    })
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
    wrap("heartbeat_task", async (args, extra) => {
      const agentName = await getAgentForRequest(args, extra);
      return toToolResult(
        await taskService.renewTaskLease(
          args.taskId,
          agentName,
          args.leaseDurationSeconds ?? 900
        )
      );
    })
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
    wrap("complete_task", async (args, extra) => {
      const agentName = await getAgentForRequest(args, extra);
      return toToolResult(
        await taskService.completeTask(args.taskId, agentName, {
          summary: args.summary,
          metadata: args.metadata
        })
      );
    })
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
    wrap("fail_task", async (args, extra) => {
      const agentName = await getAgentForRequest(args, extra);
      return toToolResult(
        await taskService.failTask(args.taskId, agentName, {
          error: args.error,
          metadata: args.metadata
        })
      );
    })
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
    wrap("release_task", async (args, extra) => {
      const agentName = await getAgentForRequest(args, extra);
      return toToolResult(
        await taskService.releaseTask(args.taskId, agentName, {
          reason: args.reason,
          metadata: args.metadata
        })
      );
    })
  );

  server.registerTool(
    "submit_task_context",
    {
      title: "Submit Task Context",
      description:
        "Submit post-task context for a completed or failed task so it can be indexed into the learning pipeline.",
      inputSchema: submitTaskContextInputShape
    },
    wrap("submit_task_context", async (args) => {
      if (!learningLoop) {
        return toolResponse({
          status: "error",
          message: "Learning pipeline is not configured.",
          guidance: ["Configure the learning loop before calling submit_task_context."],
          isError: true
        });
      }

      const { task, goal, project } = await taskQueryService.getTaskDetail(args.taskId);
      if (!task) {
        return toolResponse({
          status: "task_not_found",
          message: `Task "${args.taskId}" was not found.`,
          isError: true
        });
      }

      const outcome = resolveTaskOutcome(task.status);
      if (!outcome) {
        return toolResponse({
          status: "invalid_transition",
          message: `Task "${task.id}" must be completed or failed before submitting context.`,
          guidance: ["Wait until the task reaches a terminal state, then submit its context."],
          isError: true
        });
      }

      const summary =
        args.summary?.trim() ||
        args.messages.map((message) => message.trim()).filter((message) => message.length > 0).join("\n\n") ||
        `Task ${task.id} ended with outcome ${outcome}.`;
      const artifacts = await learningLoop.run(
        buildCompletedRun({
          task,
          goal,
          project,
          summary,
          messages: args.messages,
          outcome
        })
      );

      return toolResponse({
        status: "ok",
        message: `Indexed ${artifacts.length} artifact(s) for task ${task.id}.`,
        structuredContent: {
          taskId: task.id,
          projectId: task.projectId,
          outcome,
          indexedArtifacts: artifacts.length
        }
      });
    })
  );

  server.registerTool(
    "submit_run_context",
    {
      title: "Submit Run Context",
      description:
        "Submit richer end-of-run context for a completed or failed task so owned runtimes can distill higher-signal memory artifacts.",
      inputSchema: submitRunContextInputShape
    },
    wrap("submit_run_context", async (args, extra) => {
      if (!learningLoop) {
        return toolResponse({
          status: "error",
          message: "Learning pipeline is not configured.",
          guidance: ["Configure the learning loop before calling submit_run_context."],
          isError: true
        });
      }

      const clientCapability = await getClientCapabilityForRequest(extra);
      if (clientCapability !== "owned_runtime") {
        return toolResponse({
          status: "invalid_input",
          message: "submit_run_context is only available to owned-runtime sessions.",
          guidance: [
            "Call start_session with client.capability set to owned_runtime before submitting richer run context."
          ],
          structuredContent: { clientCapability },
          isError: true
        });
      }

      const { task, goal, project } = await taskQueryService.getTaskDetail(args.taskId);
      if (!task) {
        return toolResponse({
          status: "task_not_found",
          message: `Task "${args.taskId}" was not found.`,
          isError: true
        });
      }

      const actualOutcome = resolveTaskOutcome(task.status);
      if (!actualOutcome) {
        return toolResponse({
          status: "invalid_transition",
          message: `Task "${task.id}" must be completed or failed before submitting run context.`,
          guidance: ["Wait until the task reaches a terminal state, then submit its run context."],
          isError: true
        });
      }

      if (actualOutcome !== args.outcome) {
        return toolResponse({
          status: "invalid_input",
          message: `Task "${task.id}" has outcome ${actualOutcome}, which does not match the submitted outcome ${args.outcome}.`,
          guidance: ["Submit a run context payload whose outcome matches the task's terminal state."],
          isError: true
        });
      }

      const normalizedMessages = normalizeStringList(args.messages);
      const normalizedContext = normalizeOptionalString(args.context);
      const artifacts = await learningLoop.run(
        buildCompletedRun({
          task,
          goal,
          project,
          summary: args.summary,
          outcome: args.outcome,
          contextDump: normalizedContext,
          messages: normalizedMessages,
          filesTouched: normalizeStringList(args.filesTouched),
          errors: normalizeStringList(args.errors),
          commands: normalizeStringList(args.commands),
          decisions: normalizeStringList(args.decisions)
        })
      );

      return toolResponse({
        status: "ok",
        message: `Indexed ${artifacts.length} artifact(s) from run context for task ${task.id}.`,
        structuredContent: {
          taskId: task.id,
          projectId: task.projectId,
          outcome: args.outcome,
          indexedArtifacts: artifacts.length,
          clientCapability,
          includedEvidence: {
            context: normalizedContext != null,
            messages: normalizedMessages.length,
            filesTouched: normalizeStringList(args.filesTouched).length,
            errors: normalizeStringList(args.errors).length,
            commands: normalizeStringList(args.commands).length,
            decisions: normalizeStringList(args.decisions).length
          }
        }
      });
    })
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
    wrap("get_task", async (args) => toToolResult(await taskService.getTask(args.taskId)))
  );
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

function toolResponse({
  status,
  message,
  guidance = [],
  structuredContent,
  isError = false
}: {
  status: string;
  message: string;
  guidance?: string[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}) {
  return {
    content: [
      {
        type: "text" as const,
        text: renderMessage({ message, guidance })
      }
    ],
    structuredContent: {
      status,
      message,
      guidance,
      ...(structuredContent ?? {})
    },
    isError
  };
}

function resolveTaskOutcome(status: "completed" | "failed" | string): "success" | "failure" | null {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "failure";
  }

  return null;
}

function normalizeStringList(values?: string[]): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeOptionalString(value?: string): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function renderMessage(result: Pick<OperationResultDto, "message" | "guidance">): string {
  if (result.guidance.length === 0) {
    return result.message;
  }

  return `${result.message}\n\nNext steps:\n- ${result.guidance.join("\n- ")}`;
}
