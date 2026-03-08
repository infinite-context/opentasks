import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createLogger } from "../logging";
import { createSqliteTaskDatabase } from "./sqlite-task-database";
import { applySqliteSchema } from "./sqlite-schema";

test("sqlite task store claims dependency-ready tasks and can requeue expired leases", async () => {
  const logger = createLogger();
  const db = new Database(":memory:");
  applySqliteSchema(db, logger);

  const store = createSqliteTaskDatabase({ logger, db });

  const project = db.prepare(`
    INSERT INTO projects (id, key, name)
    VALUES ('project_1', 'test-project', 'Test Project')
    RETURNING id
  `).get() as { id: string };

  const readyTask = db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, status, priority, available_at, source)
    VALUES ('task_ready', ?, 'Ready Task', '', 'available', 'P1', datetime('now'), 'manual')
    RETURNING id
  `).get(project.id) as { id: string };

  const blockedTask = db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, status, priority, available_at, source)
    VALUES ('task_blocked', ?, 'Blocked Task', '', 'available', 'P0', datetime('now'), 'manual')
    RETURNING id
  `).get(project.id) as { id: string };

  db.prepare(`
    INSERT INTO task_dependencies (task_id, depends_on_task_id)
    VALUES (?, ?)
  `).run(blockedTask.id, readyTask.id);

  const expiredTask = db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, status, priority, available_at, assigned_to, assigned_at, lease_expires_at, source)
    VALUES ('task_expired', ?, 'Expired Task', '', 'assigned', 'P0', datetime('now', '-2 hours'), 'agent-1', datetime('now', '-2 hours'), datetime('now', '-1 hour'), 'manual')
    RETURNING id
  `).get(project.id) as { id: string };

  // 1. Claim should return the expired task first (P0, no dependencies)
  const firstClaim = await store.claimNextTask(project.id, "agent-2", {
    leaseDurationSeconds: 900
  });

  assert.ok(firstClaim);
  assert.equal(firstClaim.id, expiredTask.id);
  assert.equal(firstClaim.status, "assigned");
  assert.equal(firstClaim.assignedTo, "agent-2");

  // 2. Next claim should return the ready task (P1, no dependencies)
  // The blocked task (P0) should be skipped because it depends on the ready task
  const secondClaim = await store.claimNextTask(project.id, "agent-2", {
    leaseDurationSeconds: 900
  });

  assert.ok(secondClaim);
  assert.equal(secondClaim.id, readyTask.id);
  assert.equal(secondClaim.status, "assigned");
  assert.equal(secondClaim.assignedTo, "agent-2");

  // 3. Complete the ready task
  await store.completeTask(readyTask.id, "agent-2", { summary: "Done" });

  // 4. Now the blocked task should be claimable
  const thirdClaim = await store.claimNextTask(project.id, "agent-2", {
    leaseDurationSeconds: 900
  });

  assert.ok(thirdClaim);
  assert.equal(thirdClaim.id, blockedTask.id);
  assert.equal(thirdClaim.status, "assigned");
  assert.equal(thirdClaim.assignedTo, "agent-2");

  db.close();
});
