import assert from "node:assert/strict";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SubmitTaskContextInput } from "@opentasks/contracts";
import type { Logger } from "../../infra/logging";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import type { LearningLoop } from "../../system/learning-loop";
import { createTaskQueryService } from "../../system/task-query-service";
import { createTaskService } from "../../system/task-service";
import { createValidationService } from "../../system/validation-service";
import { registerMcpTools } from "./mcp-tools";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

type RegisteredTool = {
  inputSchema: { parse(value: unknown): SubmitTaskContextInput };
  handler: (args: SubmitTaskContextInput) => Promise<unknown>;
};

function getRegisteredTool(server: McpServer, name: string): RegisteredTool {
  const tools = (server as unknown as { _registeredTools: Record<string, RegisteredTool> })._registeredTools;
  const tool = tools[name];
  assert.ok(tool, `Expected tool "${name}" to be registered.`);
  return tool;
}

async function createTaskFixture(
  learningLoop?: LearningLoop | null
): Promise<{
  submitTaskContext: (args: SubmitTaskContextInput) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent: Record<string, unknown>;
    isError?: boolean;
  }>;
  taskService: ReturnType<typeof createTaskService>;
  taskStore: ReturnType<typeof createInMemoryTaskStore>;
  projectId: string;
  goalId: string;
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
    getAgentForRequest: async () => "agent-one"
  });

  const tool = getRegisteredTool(server, "submit_task_context");

  return {
    submitTaskContext: async (args) => {
      const parsedArgs = tool.inputSchema.parse(args);
      return (await tool.handler(parsedArgs)) as {
        content: Array<{ type: "text"; text: string }>;
        structuredContent: Record<string, unknown>;
        isError?: boolean;
      };
    },
    taskService,
    taskStore,
    projectId: project.id,
    goalId: goal.id
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
  const runs: Array<{ taskId: string; projectId: string; summary: string; outcome: string }> = [];
  const learningLoop: LearningLoop = {
    async run(run: Parameters<LearningLoop["run"]>[0]) {
      runs.push(run);
      return [{ id: `artifact-${runs.length}`, taskId: run.taskId, summary: run.summary, source: "contextual-indexing" }];
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
      summary: "First note\n\nSecond note",
      outcome: "success"
    },
    {
      taskId: failedTask.id,
      projectId,
      summary: "Custom failure summary",
      outcome: "failure"
    }
  ]);
});
