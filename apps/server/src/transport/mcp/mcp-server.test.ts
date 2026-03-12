import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDirectory, "../../../../..");
const tsxCliPath = path.join(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs");
const serverEntryPath = path.join(workspaceRoot, "apps", "server", "src", "index.ts");

test("mcp transport exposes task lifecycle tools over stdio", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCliPath, serverEntryPath],
    cwd: workspaceRoot,
    env: {
      ...process.env,
      OPENTASKS_STORAGE_DRIVER: "memory",
      OPENTASKS_AUTO_MIGRATE: "false",
      OPENTASKS_HTTP_ENABLED: "false"
    },
    stderr: "pipe"
  });
  const client = new Client({
    name: "opentasks-test-client",
    version: "0.1.0"
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);

    assert.ok(toolNames.includes("list_tasks"));
    assert.ok(toolNames.includes("search_tasks"));
    assert.ok(toolNames.includes("recommend_task_for_query"));
    assert.ok(toolNames.includes("get_project_overview"));
    assert.ok(toolNames.includes("request_task"));
    assert.ok(toolNames.includes("claim_task_by_id"));
    assert.ok(toolNames.includes("start_task"));
    assert.ok(toolNames.includes("heartbeat_task"));
    assert.ok(toolNames.includes("complete_task"));
    assert.ok(toolNames.includes("fail_task"));
    assert.ok(toolNames.includes("release_task"));
    assert.ok(toolNames.includes("get_task"));

    const createProjectResult = await client.callTool({
      name: "create_project",
      arguments: {
        key: "demo-project",
        name: "Demo Project",
        description: "Demo project for testing",
        workingDirectory: "."
      }
    });
    const createdProject = createProjectResult.structuredContent as {
      project: { id: string; key: string };
    };
    assert.ok(createdProject.project);
    assert.equal(createdProject.project.key, "demo-project");

    const createGoalResult = await client.callTool({
      name: "create_goal",
      arguments: {
        projectId: createdProject.project.id,
        key: "initial-goal",
        name: "Initial Goal"
      }
    });
    const createdGoal = createGoalResult.structuredContent as {
      goal: { id: string };
    };
    assert.ok(createdGoal.goal);

    const createTask1Result = await client.callTool({
      name: "create_task",
      arguments: {
        projectId: createdProject.project.id,
        goalId: createdGoal.goal.id,
        title: "Hydrate the next task with reusable context",
        description: "Seeded task used by the current execution path."
      }
    });
    const task1 = (createTask1Result.structuredContent as { task: { id: string } }).task;
    assert.ok(task1);

    await client.callTool({
      name: "create_task",
      arguments: {
        projectId: createdProject.project.id,
        goalId: createdGoal.goal.id,
        title: "Prepare a follow-up task for the same project",
        description: "Second seeded task that depends on the primary task.",
        dependencyIds: [task1.id]
      }
    });

    const projectResult = await client.callTool({
      name: "get_project",
      arguments: {
        projectId: "demo-project"
      }
    });
    const project = projectResult.structuredContent as {
      project: { id: string; key: string } | null;
    };

    assert.ok(project.project);
    assert.equal(project.project.key, "demo-project");

    const taskListResult = await client.callTool({
      name: "list_tasks",
      arguments: {
        projectId: "demo-project",
        limit: 10
      }
    });
    const taskList = taskListResult.structuredContent as {
      tasks: Array<{ projectId: string }>;
    };

    assert.ok(taskList.tasks.length > 0);
    assert.ok(taskList.tasks.every((task) => task.projectId === project.project?.id));

    const taskSearchResult = await client.callTool({
      name: "search_tasks",
      arguments: {
        projectId: "demo-project",
        query: "hydrate context",
        limit: 10
      }
    });
    const taskSearch = taskSearchResult.structuredContent as {
      query: string;
      results: Array<{
        task: { id: string; projectId: string; title: string };
        score: number;
        matchedFields: string[];
        claimable: boolean;
        nextClaimableDependencyTaskIds: string[];
        unresolvedUpstreamDependencies: Array<{
          id: string;
          title: string;
          status: string;
        }>;
      }>;
    };

    assert.equal(taskSearch.query, "hydrate context");
    assert.ok(taskSearch.results.length > 0);
    assert.ok(taskSearch.results.every((result) => result.task.projectId === project.project?.id));
    assert.ok(taskSearch.results.some((result) => result.task.title.includes("Hydrate")));
    assert.ok(taskSearch.results.every((result) => result.score > 0));
    assert.ok(taskSearch.results.every((result) => result.matchedFields.length > 0));
    assert.ok(taskSearch.results.every((result) => typeof result.claimable === "boolean"));
    assert.ok(taskSearch.results.every((result) => Array.isArray(result.nextClaimableDependencyTaskIds)));
    assert.ok(taskSearch.results.every((result) => Array.isArray(result.unresolvedUpstreamDependencies)));

    const recommendationResult = await client.callTool({
      name: "recommend_task_for_query",
      arguments: {
        projectId: "demo-project",
        query: "follow-up",
        limit: 10
      }
    });
    const recommendation = recommendationResult.structuredContent as {
      query: string;
      recommendedTaskId: string | null;
      recommendedTask: { id: string; title: string } | null;
    };

    assert.equal(recommendation.query, "follow-up");
    assert.ok(recommendation.recommendedTaskId);
    assert.ok(recommendation.recommendedTask);

    const explicitClaimResult = await client.callTool({
      name: "claim_task_by_id",
      arguments: {
        taskId: taskSearch.results[0]?.task.id,
        agentName: "agent-explicit",
        leaseDurationSeconds: 120
      }
    });
    const explicitClaim = explicitClaimResult.structuredContent as {
      task: { id: string; status: string; assignedTo: string } | null;
    };

    assert.ok(explicitClaim.task);
    assert.equal(explicitClaim.task.id, taskSearch.results[0]?.task.id);
    assert.equal(explicitClaim.task.status, "assigned");
    assert.equal(explicitClaim.task.assignedTo, "agent-explicit");

    const overviewResult = await client.callTool({
      name: "get_project_overview",
      arguments: {
        projectId: "demo-project"
      }
    });
    const overview = overviewResult.structuredContent as {
      project: { id: string; key: string } | null;
      tasks: Array<{ projectId: string }>;
      summary: { totalTasks: number };
    };

    assert.ok(overview.project);
    assert.equal(overview.project.key, "demo-project");
    assert.ok(overview.tasks.every((task) => task.projectId === overview.project?.id));
    assert.ok(overview.summary.totalTasks >= overview.tasks.length);

    await client.callTool({
      name: "start_task",
      arguments: {
        taskId: explicitClaim.task.id,
        agentName: "agent-explicit"
      }
    });

    await client.callTool({
      name: "heartbeat_task",
      arguments: {
        taskId: explicitClaim.task.id,
        agentName: "agent-explicit",
        leaseDurationSeconds: 120
      }
    });

    await client.callTool({
      name: "complete_task",
      arguments: {
        taskId: explicitClaim.task.id,
        agentName: "agent-explicit",
        summary: "finished successfully"
      }
    });

    const loadedResult = await client.callTool({
      name: "get_task",
      arguments: {
        taskId: explicitClaim.task.id
      }
    });
    const loaded = loadedResult.structuredContent as {
      task: { status: string };
      events: Array<{ eventType: string }>;
    };

    assert.equal(loaded.task.status, "completed");
    assert.ok(loaded.events.some((event) => event.eventType === "task_claimed"));
    assert.ok(loaded.events.some((event) => event.eventType === "task_started"));
    assert.ok(loaded.events.some((event) => event.eventType === "task_completed"));
  } finally {
    await transport.close();
  }
});
