import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import { createSessionService } from "./session-service";
import { createValidationService } from "../validation-service";

const logger = {
  section() {},
  step() {},
  info() {}
};

test("session service creates project when none exists", async () => {
  const tmpDir = join(tmpdir(), `opentasks-session-test-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    const taskStore = createInMemoryTaskStore({ logger });
    const validationService = createValidationService({
      logger,
      store: taskStore,
      projectPath: tmpdir()
    });
    const sessionService = createSessionService({
      logger,
      projectStore: taskStore,
      goalStore: taskStore,
      validationService,
      projectPath: tmpdir()
    });

    const result = await sessionService.startSession(tmpDir);

    assert.equal(result.status, "ok");
    assert.ok(result.context?.projectId);
    assert.ok(result.context?.project);
    assert.equal(result.context.project.workingDirectory, tmpDir);
    assert.ok(result.context.project.key.length > 0);
    assert.ok(result.context.project.key === result.context.project.key.toLowerCase());
    assert.equal(result.context.clientCapability, "black_box");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session service echoes explicit client capability", async () => {
  const tmpDir = join(tmpdir(), `opentasks-session-test-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    const taskStore = createInMemoryTaskStore({ logger });
    const validationService = createValidationService({
      logger,
      store: taskStore,
      projectPath: tmpdir()
    });
    const sessionService = createSessionService({
      logger,
      projectStore: taskStore,
      goalStore: taskStore,
      validationService,
      projectPath: tmpdir()
    });

    const result = await sessionService.startSession(tmpDir, "owned_runtime");

    assert.equal(result.status, "ok");
    assert.equal(result.context?.clientCapability, "owned_runtime");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session service returns existing project for exact path match", async () => {
  const tmpDir = join(tmpdir(), `opentasks-session-test-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    const taskStore = createInMemoryTaskStore({ logger });
    const validationService = createValidationService({
      logger,
      store: taskStore,
      projectPath: tmpdir()
    });
    const sessionService = createSessionService({
      logger,
      projectStore: taskStore,
      goalStore: taskStore,
      validationService,
      projectPath: tmpdir()
    });

    const first = await sessionService.startSession(tmpDir);
    assert.equal(first.status, "ok");
    const projectId = first.context!.projectId!;

    const second = await sessionService.startSession(tmpDir);
    assert.equal(second.status, "ok");
    assert.equal(second.context!.projectId, projectId);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session service returns parent project when subdirectory passed", async () => {
  const parentDir = join(tmpdir(), `opentasks-session-parent-${randomUUID()}`);
  const childDir = join(parentDir, "subfolder");
  mkdirSync(childDir, { recursive: true });
  try {
    const taskStore = createInMemoryTaskStore({ logger });
    const validationService = createValidationService({
      logger,
      store: taskStore,
      projectPath: tmpdir()
    });
    const sessionService = createSessionService({
      logger,
      projectStore: taskStore,
      goalStore: taskStore,
      validationService,
      projectPath: tmpdir()
    });

    const parentResult = await sessionService.startSession(parentDir);
    assert.equal(parentResult.status, "ok");
    const parentProjectId = parentResult.context!.projectId!;

    const childResult = await sessionService.startSession(childDir);
    assert.equal(childResult.status, "ok");
    assert.equal(childResult.context!.projectId, parentProjectId);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("session service rejects non-existent directory", async () => {
  const taskStore = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({
    logger,
    store: taskStore,
    projectPath: tmpdir()
  });
  const sessionService = createSessionService({
    logger,
    projectStore: taskStore,
    goalStore: taskStore,
    validationService,
    projectPath: tmpdir()
  });

  const result = await sessionService.startSession(join(tmpdir(), "nonexistent-dir-xyz-12345"));
  assert.equal(result.status, "invalid_input");
});

test("session service returns goal summary when project has open goals", async () => {
  const tmpDir = join(tmpdir(), `opentasks-session-goals-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    const taskStore = createInMemoryTaskStore({ logger });
    const validationService = createValidationService({
      logger,
      store: taskStore,
      projectPath: tmpdir()
    });
    const sessionService = createSessionService({
      logger,
      projectStore: taskStore,
      goalStore: taskStore,
      validationService,
      projectPath: tmpdir()
    });

    const first = await sessionService.startSession(tmpDir);
    assert.equal(first.status, "ok");
    const projectId = first.context!.projectId!;

    await taskStore.createGoal({
      projectId,
      key: "add-auth",
      name: "Add Authentication"
    });
    await taskStore.createGoal({
      projectId,
      key: "fix-bug",
      name: "Fix Login Bug"
    });

    const second = await sessionService.startSession(tmpDir);
    assert.equal(second.status, "ok");
    assert.ok(second.message.includes("Open goals:"));
    assert.ok(second.message.includes("Add Authentication"));
    assert.ok(second.message.includes("Fix Login Bug"));
    assert.equal(second.context!.goals!.length, 2);
    assert.equal(second.context!.goalSummary, "Add Authentication, Fix Login Bug");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
