import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "../../infra/logging";
import { createInMemoryAgentStore } from "../../infra/storage/in-memory-agent-store";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import { createAgentService } from "../../system/agent-service";
import { createDashboardQueryService } from "../../system/dashboard-query-service";
import { createExecutionLoop } from "../../system/execution-loop";
import { createGoalService } from "../../system/goal-service";
import type { LearningLoop } from "../../system/learning-loop";
import { createProjectService } from "../../system/project-service";
import { createSessionService } from "../../system/session-service";
import { createTaskListManager } from "../../system/task-list-manager";
import { createTaskOrchestrator } from "../../system/task-orchestrator";
import { createTaskQueryService } from "../../system/task-query-service";
import { createTaskResolutionService } from "../../system/task-resolution-service";
import { createTaskService } from "../../system/task-service";
import { createValidationService } from "../../system/validation-service";
import { createHttpTransport } from "../http/http-server";
import { createMcpHttpHandler } from "./mcp-http";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

const MCP_HTTP_PORT = 3211;

function createProtocolOnlyMcpHandler() {
  const agentStore = createInMemoryAgentStore();
  const agentService = createAgentService({ logger, agentStore });

  return createMcpHttpHandler({
    logger,
    appName: "opentasks",
    appVersion: "0.1.0",
    projectService: {} as never,
    sessionService: {} as never,
    goalService: {} as never,
    taskService: {} as never,
    executionLoop: {} as never,
    taskQueryService: {} as never,
    taskResolutionService: {} as never,
    dashboardQueryService: {} as never,
    agentService
  });
}

function createMockRequest(headers: Record<string, string | undefined>): IncomingMessage {
  return {
    headers,
    method: "POST",
    url: "/mcp",
    socket: {}
  } as IncomingMessage;
}

function createMockResponse(): {
  res: ServerResponse;
  body: () => string;
  header: (name: string) => string | undefined;
  statusCode: () => number;
} {
  const state: {
    statusCode: number;
    headersSent: boolean;
    headers: Map<string, string>;
    body: string;
  } = {
    statusCode: 200,
    headersSent: false,
    headers: new Map(),
    body: ""
  };

  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    get headersSent() {
      return state.headersSent;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      state.headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
      return res;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        state.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
      state.headersSent = true;
      return res;
    }
  } as ServerResponse;

  return {
    res,
    body: () => state.body,
    header: (name) => state.headers.get(name.toLowerCase()),
    statusCode: () => state.statusCode
  };
}

test("mcp http stale-session failures remain parseable JSON-RPC", async () => {
  const handler = createProtocolOnlyMcpHandler();
  const requestBody = {
    jsonrpc: "2.0",
    id: "request-1",
    method: "tools/call",
    params: {
      name: "start_session",
      arguments: {
        workingDirectory: "/Users/marcofregoso/Development/nexo"
      }
    }
  };

  const postResponse = createMockResponse();
  await handler.handlePost(
    createMockRequest({ "mcp-session-id": "missing-session" }),
    postResponse.res,
    requestBody
  );

  assert.equal(postResponse.statusCode(), 404);
  assert.equal(postResponse.header("content-type"), "application/json");
  const postMessage = JSONRPCMessageSchema.parse(JSON.parse(postResponse.body()));
  assert.equal((postMessage as { id?: unknown }).id, "request-1");
  assert.equal((postMessage as { error?: { code?: unknown } }).error?.code, -32001);

  const getResponse = createMockResponse();
  await handler.handleGet(createMockRequest({ "mcp-session-id": "missing-session" }), getResponse.res);

  assert.equal(getResponse.statusCode(), 404);
  assert.equal(getResponse.header("content-type"), "application/json");
  const getMessage = JSONRPCMessageSchema.parse(JSON.parse(getResponse.body()));
  assert.equal((getMessage as { id?: unknown }).id, "opentasks-transport-error");
  assert.equal((getMessage as { error?: { code?: unknown } }).error?.code, -32001);
});

test("mcp over http assigns agent per session and task lifecycle works without agentName", async () => {
  const taskStore = createInMemoryTaskStore({ logger });
  const agentStore = createInMemoryAgentStore();
  const agentService = createAgentService({ logger, agentStore });
  const validationService = createValidationService({ logger, store: taskStore, projectPath: process.cwd() });
  const projectService = createProjectService({
    logger,
    projectStore: taskStore,
    validationService
  });
  const sessionService = createSessionService({
    logger,
    projectStore: taskStore,
    goalStore: taskStore,
    validationService,
    projectPath: process.cwd()
  });
  const goalService = createGoalService({
    logger,
    goalStore: taskStore,
    taskStore,
    validationService
  });
  const taskService = createTaskService({
    logger,
    taskStore,
    validationService,
    defaultLeaseDurationSeconds: 900
  });
  const taskListManager = createTaskListManager({ logger, taskStore });
  const taskOrchestrator = createTaskOrchestrator({
    logger,
    validationService,
    goalService,
    taskListManager,
    defaultLeaseDurationSeconds: 900
  });
  const executionLoop = createExecutionLoop({ logger, taskOrchestrator });
  const taskQueryService = createTaskQueryService({ logger, taskStore });
  const taskResolutionService = createTaskResolutionService({
    logger,
    taskQueryService,
    taskStore
  });
  const dashboardQueryService = createDashboardQueryService({ logger, taskStore });
  const learningRuns: Array<Parameters<LearningLoop["run"]>[0]> = [];
  const learningLoop: LearningLoop = {
    async run(run: Parameters<LearningLoop["run"]>[0]) {
      learningRuns.push(run);
      return [
        {
          id: `artifact-${learningRuns.length}`,
          taskId: run.taskId,
          kind: "run_note",
          content: run.summary,
          summary: run.summary,
          source: "contextual-indexing"
        }
      ];
    }
  };

  const mcpHandler = createMcpHttpHandler({
    logger,
    appName: "opentasks",
    appVersion: "0.1.0",
    projectService,
    sessionService,
    goalService,
    taskService,
    executionLoop,
    taskQueryService,
    taskResolutionService,
    dashboardQueryService,
    agentService,
    learningLoop
  });

  const httpTransport = createHttpTransport({
    logger,
    appName: "opentasks",
    appVersion: "0.1.0",
    projectPath: process.cwd(),
    port: MCP_HTTP_PORT,
    projectService,
    goalService,
    dashboardQueryService,
    taskQueryService,
    mcpHandler
  });

  await httpTransport.start();

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${MCP_HTTP_PORT}/mcp`));
  const client = new Client({
    name: "opentasks-http-test-client",
    version: "0.1.0"
  });

  try {
    await client.connect(transport);

    const startSessionResult = await client.callTool({
      name: "start_session",
      arguments: {
        workingDirectory: "."
      }
    });
    const createdProject = (startSessionResult.structuredContent as {
      clientCapability: string;
      project: { id: string; key: string; name: string; description: string };
    }).project;
    const startSessionContent = startSessionResult.structuredContent as {
      clientCapability: string;
      project: { id: string; key: string; name: string; description: string };
    };
    assert.equal(startSessionContent.clientCapability, "black_box");
    assert.ok(createdProject);
    assert.ok(createdProject.id);

    const createGoalResult = await client.callTool({
      name: "create_goal",
      arguments: {
        projectId: createdProject.id,
        key: "http-goal",
        name: "HTTP Goal"
      }
    });
    const createdGoal = (createGoalResult.structuredContent as { goal: { id: string } }).goal;
    assert.ok(createdGoal);

    await client.callTool({
      name: "create_task",
      arguments: {
        projectId: createdProject.id,
        goalId: createdGoal.id,
        title: "Task for session-bound agent",
        description: "Should be assigned to session agent without passing agentName"
      }
    });

    const requestResult = await client.callTool({
      name: "request_task",
      arguments: {
        projectId: createdProject.id
      }
    });
    assert.ok(!requestResult.isError, `request_task should succeed, got: ${JSON.stringify(requestResult)}`);
    const requestContent = requestResult.structuredContent as {
      status: string;
      task?: { id: string; assignedTo?: string };
    };
    assert.ok(requestContent?.task, `request_task should return a task, got: ${JSON.stringify(requestContent)}`);
    const assignedTo = requestContent.task.assignedTo;
    assert.ok(assignedTo, `Task should be assigned to session agent, got task: ${JSON.stringify(requestContent.task)}`);
    assert.equal(assignedTo, "opentasks-http-test-client", "Task should be assigned to client-named agent");

    await client.callTool({
      name: "start_task",
      arguments: {
        taskId: requestContent.task.id
      }
    });

    await client.callTool({
      name: "complete_task",
      arguments: {
        taskId: requestContent.task.id,
        summary: "Completed by session-bound agent"
      }
    });

    const submitContextResult = await client.callTool({
      name: "submit_task_context",
      arguments: {
        taskId: requestContent.task.id,
        messages: ["HTTP completion note", "Additional recovered context"]
      }
    });
    const submitContext = submitContextResult.structuredContent as {
      status: string;
      indexedArtifacts: number;
      outcome: string;
    };
    assert.ok(!submitContextResult.isError, `submit_task_context should succeed, got: ${JSON.stringify(submitContextResult)}`);
    assert.equal(submitContext.status, "ok");
    assert.equal(submitContext.indexedArtifacts, 1);
    assert.equal(submitContext.outcome, "success");
    assert.deepEqual(learningRuns, [
      {
        taskId: requestContent.task.id,
        projectId: createdProject.id,
        projectName: createdProject.name,
        projectDescription: createdProject.description,
        goalId: createdGoal.id,
        goalName: "HTTP Goal",
        goalDescription: "",
        taskTitle: "Task for session-bound agent",
        taskDescription: "Should be assigned to session agent without passing agentName",
        summary: "HTTP completion note\n\nAdditional recovered context",
        contextDump: null,
        messages: ["HTTP completion note", "Additional recovered context"],
        filesTouched: [],
        errors: [],
        commands: [],
        decisions: [],
        outcome: "success"
      }
    ]);

    const getTaskResult = await client.callTool({
      name: "get_task",
      arguments: { taskId: requestContent.task.id }
    });
    const taskDetail = getTaskResult.structuredContent as {
      task: { status: string } | null;
      events: Array<{ eventType: string }>;
    };
    assert.ok(taskDetail, "get_task should return structured content");
    assert.ok(taskDetail.task, `get_task should return task, got: ${JSON.stringify(taskDetail)}`);
    assert.equal(taskDetail.task.status, "completed");
    assert.ok(taskDetail.events.some((e) => e.eventType === "task_claimed"));
    assert.ok(taskDetail.events.some((e) => e.eventType === "task_started"));
    assert.ok(taskDetail.events.some((e) => e.eventType === "task_completed"));
  } finally {
    await transport.close();
    await httpTransport.close();
  }
});
