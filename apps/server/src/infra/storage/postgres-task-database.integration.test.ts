import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresTaskDatabase } from "./postgres-task-database";
import { applyPostgresSchema } from "./postgres-schema";
import type { Logger } from "../logging";

const testDatabaseUrl = process.env.OPENTASKS_TEST_DATABASE_URL ?? process.env.OPENTASKS_DATABASE_URL;

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test(
  "postgres task store claims dependency-ready tasks and can requeue expired leases",
  {
    skip: testDatabaseUrl ? false : "Set OPENTASKS_TEST_DATABASE_URL to run PostgreSQL integration tests."
  },
  async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const store = createPostgresTaskDatabase({ logger, pool });

    try {
      await applyPostgresSchema(pool, logger);
      await pool.query(`
        DELETE FROM task_events;
        DELETE FROM task_dependencies;
        DELETE FROM tasks;
        DELETE FROM projects;
      `);

      const projectInsert = await pool.query<{ id: string }>(
        `
          INSERT INTO projects (key, name)
          VALUES ('itest-project', 'Integration Test Project')
          RETURNING id
        `
      );
      const projectId = projectInsert.rows[0].id;

      const readyTaskInsert = await pool.query<{ id: string }>(
        `
          INSERT INTO tasks (
            project_id,
            title,
            description,
            status,
            priority,
            available_at,
            source
          )
          VALUES ($1, 'Ready task', 'No dependencies.', 'available', 'P0', NOW(), 'manual')
          RETURNING id
        `,
        [projectId]
      );
      const readyTaskId = readyTaskInsert.rows[0].id;

      const blockedTaskInsert = await pool.query<{ id: string }>(
        `
          INSERT INTO tasks (
            project_id,
            title,
            description,
            status,
            priority,
            available_at,
            source
          )
          VALUES ($1, 'Blocked task', 'Depends on the ready task.', 'available', 'P2', NOW(), 'manual')
          RETURNING id
        `,
        [projectId]
      );
      const blockedTaskId = blockedTaskInsert.rows[0].id;

      const expiredTaskInsert = await pool.query<{ id: string }>(
        `
          INSERT INTO tasks (
            project_id,
            title,
            description,
            status,
            priority,
            available_at,
            source
          )
          VALUES ($1, 'Expired lease task', 'Should be requeued when leases expire.', 'assigned', 'P1', NOW(), 'manual')
          RETURNING id
        `,
        [projectId]
      );
      const expiredTaskId = expiredTaskInsert.rows[0].id;

      await pool.query(
        `
          INSERT INTO task_dependencies (task_id, depends_on_task_id)
          VALUES ($1, $2)
        `,
        [blockedTaskId, readyTaskId]
      );

      await pool.query(
        `
          UPDATE tasks
          SET
            assigned_to = 'agent-stale',
            assigned_at = NOW() - INTERVAL '10 minutes',
            lease_expires_at = NOW() - INTERVAL '1 minute',
            updated_at = NOW() - INTERVAL '10 minutes'
          WHERE id = $1
        `,
        [expiredTaskId]
      );

      const requeuedCount = await store.requeueExpiredTasks(projectId);
      assert.equal(requeuedCount, 1);

      const firstClaim = await store.claimNextTask(projectId, "agent-one", {
        leaseDurationSeconds: 300
      });

      assert.ok(firstClaim);
      assert.equal(firstClaim.id, readyTaskId);

      await store.completeTask(firstClaim.id, "agent-one", {
        summary: "dependency unblocked"
      });

      const secondClaim = await store.claimNextTask(projectId, "agent-two", {
        leaseDurationSeconds: 300
      });

      assert.ok(secondClaim);
      assert.equal(secondClaim.id, expiredTaskId);

      const thirdClaim = await store.claimNextTask(projectId, "agent-three", {
        leaseDurationSeconds: 300
      });

      assert.ok(thirdClaim);
      assert.equal(thirdClaim.id, blockedTaskId);

      const events = await store.listTaskEvents(expiredTaskId);
      assert.ok(events.some((event) => event.eventType === "task_requeued"));
      assert.ok(events.some((event) => event.eventType === "task_claimed"));
    } finally {
      await pool.query(`
        DELETE FROM task_events;
        DELETE FROM task_dependencies;
        DELETE FROM tasks;
        DELETE FROM projects;
      `);
      await pool.end();
    }
  }
);
