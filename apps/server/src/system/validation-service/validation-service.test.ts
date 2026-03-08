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

test("validation service rejects project creation without description", async () => {
  const store = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({ logger, store });

  const result = await validationService.validateCreateProjectInput({
    key: "test",
    name: "Test",
    description: "",
    workingDirectory: "."
  });

  assert.equal(result.status, "invalid_input");
  assert.ok(result.message?.includes("description"));
});

test("validation service rejects project creation without working directory", async () => {
  const store = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({ logger, store });

  const result = await validationService.validateCreateProjectInput({
    key: "test",
    name: "Test",
    description: "A description",
    workingDirectory: ""
  });

  assert.equal(result.status, "invalid_input");
  assert.ok(result.message?.includes("working directory"));
});

test("validation service accepts valid project input when directory exists", async () => {
  const store = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({ logger, store });

  const result = await validationService.validateCreateProjectInput({
    key: "test",
    name: "Test",
    description: "A description",
    workingDirectory: "."
  });

  assert.equal(result.status, "ok");
});

test("validation service rejects project creation when working directory does not exist", async () => {
  const store = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({ logger, store });

  const result = await validationService.validateCreateProjectInput({
    key: "test",
    name: "Test",
    description: "A description",
    workingDirectory: "./definitely-nonexistent-dir-xyz-12345"
  });

  assert.equal(result.status, "invalid_input");
  assert.ok(result.message?.includes("does not exist"));
});

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
    name: "Empty Project",
    description: "A project with no goals",
    workingDirectory: "."
  });
  const validationService = createValidationService({ logger, store });

  const result = await validationService.ensureProjectGoals(project.id);

  assert.equal(result.status, "missing_goals");
  assert.equal(result.context?.project?.id, project.id);
});
