import assert from "node:assert/strict";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ClientRuntimeCapability,
  SubmitRunContextInput,
  SubmitTaskContextInput
} from "@opentasks/contracts";
import type { Logger } from "../../infra/logging";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import type { LearningLoop } from "../../system/learning-loop";
import { createTaskQueryService } from "../../system/task-query-service";
import { createTaskService } from "../../system/task-service";
import { createValidationService } from "../../system/validation-service";
import { registerMcpTools } from "./mcp-tools";
import { startSessionInputSchema } from "@opentasks/contracts/schemas";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

type RegisteredTool = {
  description?: string;
  inputSchema: { parse(value: unknown): unknown };
  handler: (args: unknown, extra?: unknown) => Promise<unknown>;
};

function getRegisteredTool(server: McpServer, name: string): RegisteredTool {
  const tools = (server as unknown as { _registeredTools: Record<string, RegisteredTool> })._registeredTools;
  const tool = tools[name];
  assert.ok(tool, `Expected tool "${name}" to be registered.`);
  return tool;
}

test("start_session guidance explains runtime capability selection", () => {
  const server = new McpServer({ name: "opentasks-test", version: "0.1.0" });

  registerMcpTools(server, {
    projectService: {} as never,
    sessionService: {} as never,
    goalService: {} as never,
    taskService: {} as never,
    executionLoop: {} as never,
    taskQueryService: {} as never,
    taskResolutionService: {} as never,
    dashboardQueryService: {} as never,
    learningLoop: null,
    getAgentForRequest: async () => "agent-one",
    getClientCapabilityForRequest: async () => "black_box",
    setClientCapabilityForRequest: async () => {}
  });

  const tool = getRegisteredTool(server, "start_session");
  const description = tool.description ?? "";
  assert.match(description, /defaults to black_box/);
  assert.match(description, /Codex/);
  assert.match(description, /Claude Code/);
  assert.match(description, /Cursor/);
  assert.match(description, /submit_run_context/);
  assert.match(description, /Do not choose owned_runtime just because you can summarize your work/);

  const workingDirectoryDescription = startSessionInputSchema.shape.workingDirectory.description ?? "";
  const clientDescription = startSessionInputSchema.shape.client.description ?? "";
  const clientSchema = (startSessionInputSchema.shape.client as { unwrap: () => { shape: { capability: { description?: string } } } }).unwrap();
  const capabilityDescription = clientSchema.shape.capability.description ?? "";

  assert.match(workingDirectoryDescription, /project\/workspace root/);
  assert.match(clientDescription, /client\/runtime metadata/);
  assert.match(capabilityDescription, /Defaults to black_box/);
  assert.match(capabilityDescription, /standard external agents such as Codex, Claude Code, or Cursor/);
  assert.match(capabilityDescription, /submit_run_context/);

  const claimToolDescription = getRegisteredTool(server, "claim_task_by_id").description ?? "";
  assert.match(claimToolDescription, /hydrated context/);
});

async function createTaskFixture(
  learningLoop?: LearningLoop | null
): Promise<{
  submitTaskContext: (args: SubmitTaskContextInput) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent: Record<string, unknown>;
    isError?: boolean;
  }>;
  submitRunContext: (args: SubmitRunContextInput) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent: Record<string, unknown>;
    isError?: boolean;
  }>;
  claimTaskById: (args: { taskId: string; agentName?: string; leaseDurationSeconds?: number }) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent: Record<string, unknown>;
    isError?: boolean;
  }>;
  taskService: ReturnType<typeof createTaskService>;
  taskStore: ReturnType<typeof createInMemoryTaskStore>;
  projectId: string;
  goalId: string;
  setClientCapability: (capability: ClientRuntimeCapability) => void;
}> {
  const taskStore = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({ logger, store: taskStore });
  const taskService = createTaskService({
    logger,
    taskStore,
    validationService,
    defaultLeaseDurationSeconds: 900
  });
  const taskQueryService = createTaskQueryService({ logger, taskStore });

  const project = await taskStore.createProject({
    key: "mcp-tools-project",
    name: "MCP Tools Project",
    description: "Project for MCP tool tests",
    workingDirectory: process.cwd()
  });
  const goal = await taskStore.createGoal({
    projectId: project.id,
    key: "mcp-tools-goal",
    name: "MCP Tools Goal"
  });

  assert.ok(project);
  assert.ok(goal);

  const server = new McpServer({ name: "opentasks-test", version: "0.1.0" });
  let clientCapability: ClientRuntimeCapability = "black_box";
  registerMcpTools(server, {
    projectService: {} as never,
    sessionService: {} as never,
    goalService: {} as never,
    taskService,
    executionLoop: {} as never,
    taskQueryService,
    taskResolutionService: {} as never,
    dashboardQueryService: {} as never,
    learningLoop,
    getAgentForRequest: async () => "agent-one",
    getClientCapabilityForRequest: async () => clientCapability,
    setClientCapabilityForRequest: async (capability) => {
      clientCapability = capability;
    }
  });

  const tool = getRegisteredTool(server, "submit_task_context");
  const runContextTool = getRegisteredTool(server, "submit_run_context");
  const claimTool = getRegisteredTool(server, "claim_task_by_id");

  return {
    submitTaskContext: async (args) => {
      const parsedArgs = tool.inputSchema.parse(args);
      return (await tool.handler(parsedArgs)) as {
        content: Array<{ type: "text"; text: string }>;
        structuredContent: Record<string, unknown>;
        isError?: boolean;
      };
    },
    submitRunContext: async (args) => {
      const parsedArgs = runContextTool.inputSchema.parse(args);
      return (await runContextTool.handler(parsedArgs)) as {
        content: Array<{ type: "text"; text: string }>;
        structuredContent: Record<string, unknown>;
        isError?: boolean;
      };
    },
    claimTaskById: async (args) => {
      const parsedArgs = claimTool.inputSchema.parse(args);
      return (await claimTool.handler(parsedArgs)) as {
        content: Array<{ type: "text"; text: string }>;
        structuredContent: Record<string, unknown>;
        isError?: boolean;
      };
    },
    taskService,
    taskStore,
    projectId: project.id,
    goalId: goal.id,
    setClientCapability: (capability) => {
      clientCapability = capability;
    }
  };
}

async function createTaskForFixture(
  taskStore: ReturnType<typeof createInMemoryTaskStore>,
  projectId: string,
  goalId: string,
  title: string
) {
  const task = await taskStore.createTask({
    projectId,
    goalId,
    title,
    description: `${title} description`
  });

  assert.ok(task);
  return task;
}

test("claim_task_by_id returns hydrated context field after a successful claim", async () => {
  const { claimTaskById, taskStore, projectId, goalId } = await createTaskFixture(null);
  const task = await createTaskForFixture(taskStore, projectId, goalId, "Explicit claim task");

  const result = await claimTaskById({
    taskId: task.id,
    leaseDurationSeconds: 120
  });

  const claimedTask = result.structuredContent.task as { id: string; status: string; assignedTo: string };
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "ok");
  assert.equal(claimedTask.id, task.id);
  assert.equal(claimedTask.status, "assigned");
  assert.equal(claimedTask.assignedTo, "agent-one");
  assert.equal(result.structuredContent.hydratedContext, null);
});

test("submit_task_context returns an error when the learning pipeline is unavailable", async () => {
  const { submitTaskContext } = await createTaskFixture(null);
  const result = await submitTaskContext({
    taskId: "task-123",
    messages: ["Completed task details"]
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, "error");
  assert.match(String(result.structuredContent.message), /Learning pipeline is not configured/);
});

test("submit_task_context rejects missing tasks", async () => {
  const learningLoop: LearningLoop = {
    async run() {
      return [];
    }
  };
  const { submitTaskContext } = await createTaskFixture(learningLoop);
  const result = await submitTaskContext({
    taskId: "missing-task",
    messages: ["Completed task details"]
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, "task_not_found");
  assert.match(String(result.structuredContent.message), /missing-task/);
});

test("submit_task_context rejects non-terminal tasks", async () => {
  const learningLoop: LearningLoop = {
    async run() {
      return [];
    }
  };
  const { submitTaskContext, taskStore, projectId, goalId } = await createTaskFixture(learningLoop);
  const task = await createTaskForFixture(taskStore, projectId, goalId, "Non-terminal task");
  const result = await submitTaskContext({
    taskId: task.id,
    messages: ["Context before completion"]
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, "invalid_transition");
  assert.match(String(result.structuredContent.message), /must be completed or failed/);
});

test("submit_task_context indexes submitted context for completed and failed tasks", async () => {
  const runs: Array<Parameters<LearningLoop["run"]>[0]> = [];
  const learningLoop: LearningLoop = {
    async run(run: Parameters<LearningLoop["run"]>[0]) {
      runs.push(run);
      return [{
        id: `artifact-${runs.length}`,
        taskId: run.taskId,
        kind: "run_note",
        content: run.summary,
        summary: run.summary,
        source: "contextual-indexing"
      }];
    }
  };
  const { submitTaskContext, taskService, taskStore, projectId, goalId } =
    await createTaskFixture(learningLoop);

  const completedTask = await createTaskForFixture(taskStore, projectId, goalId, "Completed task");
  assert.equal((await taskService.claimTaskById(completedTask.id, "agent-one")).status, "ok");
  assert.equal((await taskService.startTask(completedTask.id, "agent-one")).status, "ok");
  assert.equal(
    (await taskService.completeTask(completedTask.id, "agent-one", { summary: "Original completion summary" })).status,
    "ok"
  );

  const completedResult = await submitTaskContext({
    taskId: completedTask.id,
    messages: ["First note", "Second note"]
  });

  assert.equal(completedResult.isError, false);
  assert.equal(completedResult.structuredContent.status, "ok");
  assert.equal(completedResult.structuredContent.indexedArtifacts, 1);

  const failedTask = await createTaskForFixture(taskStore, projectId, goalId, "Failed task");
  assert.equal((await taskService.claimTaskById(failedTask.id, "agent-one")).status, "ok");
  assert.equal((await taskService.startTask(failedTask.id, "agent-one")).status, "ok");
  assert.equal(
    (await taskService.failTask(failedTask.id, "agent-one", { error: "Original failure" })).status,
    "ok"
  );

  const failedResult = await submitTaskContext({
    taskId: failedTask.id,
    messages: ["Failure note"],
    summary: "Custom failure summary"
  });

  assert.equal(failedResult.isError, false);
  assert.equal(failedResult.structuredContent.status, "ok");
  assert.equal(failedResult.structuredContent.indexedArtifacts, 1);
  assert.deepEqual(runs, [
    {
      taskId: completedTask.id,
      projectId,
      projectName: "MCP Tools Project",
      projectDescription: "Project for MCP tool tests",
      goalId,
      goalName: "MCP Tools Goal",
      goalDescription: "",
      taskTitle: completedTask.title,
      taskDescription: completedTask.description,
      summary: "First note\n\nSecond note",
      contextDump: null,
      messages: ["First note", "Second note"],
      filesTouched: [],
      errors: [],
      commands: [],
      decisions: [],
      outcome: "success"
    },
    {
      taskId: failedTask.id,
      projectId,
      projectName: "MCP Tools Project",
      projectDescription: "Project for MCP tool tests",
      goalId,
      goalName: "MCP Tools Goal",
      goalDescription: "",
      taskTitle: failedTask.title,
      taskDescription: failedTask.description,
      summary: "Custom failure summary",
      contextDump: null,
      messages: ["Failure note"],
      filesTouched: [],
      errors: [],
      commands: [],
      decisions: [],
      outcome: "failure"
    }
  ]);
});

test("submit_run_context rejects black-box capability", async () => {
  const learningLoop: LearningLoop = {
    async run() {
      return [];
    }
  };
  const { submitRunContext, taskService, taskStore, projectId, goalId } = await createTaskFixture(learningLoop);
  const task = await createTaskForFixture(taskStore, projectId, goalId, "Owned runtime only task");
  assert.equal((await taskService.claimTaskById(task.id, "agent-one")).status, "ok");
  assert.equal((await taskService.startTask(task.id, "agent-one")).status, "ok");
  assert.equal((await taskService.completeTask(task.id, "agent-one", { summary: "Finished" })).status, "ok");

  const result = await submitRunContext({
    taskId: task.id,
    summary: "Detailed run summary",
    outcome: "success",
    messages: ["A richer runtime note"]
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, "invalid_input");
  assert.equal(result.structuredContent.clientCapability, "black_box");
});

test("submit_run_context indexes richer evidence for owned-runtime sessions", async () => {
  const runs: Array<Parameters<LearningLoop["run"]>[0]> = [];
  const learningLoop: LearningLoop = {
    async run(run: Parameters<LearningLoop["run"]>[0]) {
      runs.push(run);
      return [{
        id: `artifact-${runs.length}`,
        taskId: run.taskId,
        kind: "run_note",
        content: run.summary,
        summary: run.summary,
        source: "contextual-indexing"
      }];
    }
  };

  const {
    submitRunContext,
    taskService,
    taskStore,
    projectId,
    goalId,
    setClientCapability
  } = await createTaskFixture(learningLoop);
  setClientCapability("owned_runtime");

  const task = await createTaskForFixture(taskStore, projectId, goalId, "Owned runtime context task");
  assert.equal((await taskService.claimTaskById(task.id, "agent-one")).status, "ok");
  assert.equal((await taskService.startTask(task.id, "agent-one")).status, "ok");
  assert.equal((await taskService.failTask(task.id, "agent-one", { error: "Underlying error" })).status, "ok");

  const result = await submitRunContext({
    taskId: task.id,
    summary: "Browser agent found a stable selector after a redirect.",
    outcome: "failure",
    context: "The run hit a login redirect before the target page stabilized.",
    messages: ["Wait for the authenticated redirect before looking up the table rows."],
    filesTouched: ["apps/web/src/routes/dashboard.tsx"],
    errors: ["Initial selector lookup timed out."],
    commands: ["open dashboard and wait for auth redirect"],
    decisions: ["Prefer the stable data-testid selector over text matching."]
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "ok");
  assert.equal(result.structuredContent.indexedArtifacts, 1);
  assert.deepEqual(runs, [
    {
      taskId: task.id,
      projectId,
      projectName: "MCP Tools Project",
      projectDescription: "Project for MCP tool tests",
      goalId,
      goalName: "MCP Tools Goal",
      goalDescription: "",
      taskTitle: task.title,
      taskDescription: task.description,
      summary: "Browser agent found a stable selector after a redirect.",
      contextDump: "The run hit a login redirect before the target page stabilized.",
      messages: ["Wait for the authenticated redirect before looking up the table rows."],
      filesTouched: ["apps/web/src/routes/dashboard.tsx"],
      errors: ["Initial selector lookup timed out."],
      commands: ["open dashboard and wait for auth redirect"],
      decisions: ["Prefer the stable data-testid selector over text matching."],
      outcome: "failure"
    }
  ]);
});
