import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "../../infra/logging";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import { createDashboardQueryService } from "../../system/dashboard-query-service";
import { createGoalService } from "../../system/goal-service";
import { createProjectService } from "../../system/project-service";
import { createTaskQueryService } from "../../system/task-query-service";
import { createValidationService } from "../../system/validation-service";
import { createHttpTransport } from "./http-server";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test("http transport serves dashboard snapshots and task detail", async () => {
  const taskStore = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({ logger, store: taskStore });
  const projectService = createProjectService({
    logger,
    projectStore: taskStore,
    validationService
  });
  const goalService = createGoalService({
    logger,
    goalStore: taskStore,
    taskStore,
    validationService
  });
  const dashboardQueryService = createDashboardQueryService({ logger, taskStore });
  const taskQueryService = createTaskQueryService({ logger, taskStore });
  const httpTransport = createHttpTransport({
    logger,
    appName: "opentasks",
    appVersion: "0.1.0",
    projectPath: process.cwd(),
    port: 3210,
    projectService,
    goalService,
    dashboardQueryService,
    taskQueryService
  });

  await httpTransport.start();

  try {
    const projectsResponse = await fetch("http://127.0.0.1:3210/api/projects?limit=10");
    assert.equal(projectsResponse.status, 200);
    const projectsDto = (await projectsResponse.json()) as {
      projects: Array<{ id: string; key: string; name: string }>;
    };
    assert.ok(projectsDto.projects.length >= 2);
    assert.ok(projectsDto.projects.some((project) => project.key === "demo-project"));

    const createProjectResponse = await fetch("http://127.0.0.1:3210/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        key: "http-created-project",
        name: "HTTP Created Project",
        description: "Project created via HTTP test",
        workingDirectory: "."
      })
    });
    assert.equal(createProjectResponse.status, 201);
    const createdProject = (await createProjectResponse.json()) as { id: string; key: string; name: string };
    assert.equal(createdProject.key, "http-created-project");

    const goalsResponse = await fetch("http://127.0.0.1:3210/api/goals?projectId=demo-project");
    assert.equal(goalsResponse.status, 200);
    const goalsDto = (await goalsResponse.json()) as {
      goals: Array<{ id: string; key: string; name: string }>;
    };
    assert.ok(goalsDto.goals.length >= 1);

    const dashboardResponse = await fetch("http://127.0.0.1:3210/api/dashboard?projectId=demo-project");
    assert.equal(dashboardResponse.status, 200);
    const dashboard = (await dashboardResponse.json()) as {
      tasks: Array<{ id: string }>;
      summary: { totalTasks: number };
      project: { key: string } | null;
    };

    assert.ok(dashboard.project);
    assert.equal(dashboard.project.key, "demo-project");
    assert.ok(dashboard.summary.totalTasks > 0);
    assert.ok(dashboard.tasks.length > 0);

    const taskId = dashboard.tasks[0].id;
    const taskResponse = await fetch(`http://127.0.0.1:3210/api/tasks/${encodeURIComponent(taskId)}`);
    assert.equal(taskResponse.status, 200);
    const taskDetail = (await taskResponse.json()) as {
      task: { id: string } | null;
      events: Array<{ eventType: string }>;
    };

    assert.equal(taskDetail.task?.id, taskId);
    assert.ok(taskDetail.events.length >= 1);

    const streamResponse = await fetch("http://127.0.0.1:3210/api/dashboard/stream?projectId=demo-project");
    assert.equal(streamResponse.status, 200);
    assert.ok(streamResponse.headers.get("content-type")?.includes("text/event-stream"));

    const reader = streamResponse.body?.getReader();
    assert.ok(reader);
    let chunkText = "";

    for (let index = 0; index < 3 && !chunkText.includes("dashboard.snapshot"); index += 1) {
      const chunk = await reader.read();
      chunkText += new TextDecoder().decode(chunk.value);
      if (chunk.done) {
        break;
      }
    }

    assert.match(chunkText, /dashboard\.snapshot/);
    await reader.cancel();
  } finally {
    await httpTransport.close();
  }
});
