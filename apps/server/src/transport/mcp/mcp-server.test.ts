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
      OPENTASKS_SEED_DEMO_DATA: "true"
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

    assert.ok(toolNames.includes("request_task"));
    assert.ok(toolNames.includes("start_task"));
    assert.ok(toolNames.includes("heartbeat_task"));
    assert.ok(toolNames.includes("complete_task"));
    assert.ok(toolNames.includes("fail_task"));
    assert.ok(toolNames.includes("release_task"));
    assert.ok(toolNames.includes("get_task"));

    const claimedResult = await client.callTool({
      name: "request_task",
      arguments: {
        agentName: "agent-one",
        projectId: "demo-project",
        taskHint: "claim the next task"
      }
    });
    const claimed = claimedResult.structuredContent as {
      task: { id: string; status: string } | null;
    };

    assert.ok(claimed.task);
    assert.equal(claimed.task.status, "assigned");

    await client.callTool({
      name: "start_task",
      arguments: {
        taskId: claimed.task.id,
        agentName: "agent-one"
      }
    });

    await client.callTool({
      name: "heartbeat_task",
      arguments: {
        taskId: claimed.task.id,
        agentName: "agent-one",
        leaseDurationSeconds: 120
      }
    });

    await client.callTool({
      name: "complete_task",
      arguments: {
        taskId: claimed.task.id,
        agentName: "agent-one",
        summary: "finished successfully"
      }
    });

    const loadedResult = await client.callTool({
      name: "get_task",
      arguments: {
        taskId: claimed.task.id
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
