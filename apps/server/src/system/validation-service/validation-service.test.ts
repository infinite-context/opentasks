import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "../../infra/logging";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import { createValidationService } from "./validation-service";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test("validation service returns known projects when a project is missing", async () => {
  const store = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({ logger, store });

  const result = await validationService.ensureProject("missing-project");

  assert.equal(result.status, "project_not_found");
  assert.ok((result.context?.projects?.length ?? 0) > 0);
});

test("validation service asks for a goal when a project has none", async () => {
  const store = createInMemoryTaskStore({ logger });
  const project = await store.createProject({
    key: "empty-project",
    name: "Empty Project"
  });
  const validationService = createValidationService({ logger, store });

  const result = await validationService.ensureProjectGoals(project.id);

  assert.equal(result.status, "missing_goals");
  assert.equal(result.context?.project?.id, project.id);
});
