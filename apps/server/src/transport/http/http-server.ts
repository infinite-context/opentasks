import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import fastify from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { FastifySSEPlugin } from "fastify-sse-v2";
import {
  agentListQuerySchema,
  createProjectInputSchema,
  mcpLogListQuerySchema,
  dashboardQuerySchema,
  dashboardStreamEventDtoSchema,
  goalListQuerySchema,
  memoryListQuerySchema,
  memorySearchQuerySchema,
  projectListQuerySchema,
  taskListQuerySchema,
  taskMemoryParamsSchema,
  taskMemoryQuerySchema
} from "@opentasks/contracts/schemas";
import type { Logger } from "../../infra/logging";
import type { AgentService } from "../../system/agent-service";
import type { McpLogStore } from "../../infra/storage/mcp-log-store";
import type { DashboardQueryService } from "../../system/dashboard-query-service";
import type { GoalService } from "../../system/goal-service";
import type { MemoryQueryService } from "../../system/memory-query-service";
import type { ProjectService } from "../../system/project-service";
import type { TaskQueryService } from "../../system/task-query-service";
import type { HttpTransport } from "./types";

export interface McpHttpHandler {
  handlePost: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, body?: unknown) => Promise<void>;
  handleGet: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>;
  handleDelete: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>;
}

interface CreateHttpTransportParams {
  logger: Logger;
  appName: string;
  appVersion: string;
  projectPath: string;
  port: number;
  projectService: ProjectService;
  goalService: GoalService;
  dashboardQueryService: DashboardQueryService;
  memoryQueryService: MemoryQueryService;
  taskQueryService: TaskQueryService;
  agentService?: AgentService;
  mcpLogStore?: McpLogStore;
  mcpHandler?: McpHttpHandler;
}

const execAsync = promisify(exec);

async function showFolderPicker(): Promise<string | null> {
  try {
    const platform = os.platform();
    if (platform === "win32") {
      const script = `Add-Type -AssemblyName System.Windows.Forms; $fbd = New-Object System.Windows.Forms.FolderBrowserDialog; $fbd.ShowNewFolderButton = $true; if ($fbd.ShowDialog() -eq 'OK') { Write-Output $fbd.SelectedPath }`;
      const { stdout } = await execAsync(`powershell -NoProfile -STA -Command "${script}"`);
      const path = stdout.trim();
      return path || null;
    } else if (platform === "darwin") {
      const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to activate' -e 'tell application "System Events" to return POSIX path of (choose folder)'`);
      const path = stdout.trim();
      return path || null;
    } else if (platform === "linux") {
      const { stdout } = await execAsync(`zenity --file-selection --directory`);
      const path = stdout.trim();
      return path || null;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function createHttpTransport({
  logger,
  appName,
  appVersion,
  projectPath,
  port,
  projectService,
  goalService,
  dashboardQueryService,
  memoryQueryService,
  taskQueryService,
  agentService,
  mcpLogStore,
  mcpHandler
}: CreateHttpTransportParams): HttpTransport {
  const server = fastify({
    logger: false,
    forceCloseConnections: true
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  server.register(FastifySSEPlugin);

  server.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, MCP-Session-Id");
  });

  server.options("*", async (request, reply) => {
    return reply.status(204).send();
  });

  if (mcpHandler) {
    server.post("/mcp", async (request, reply) => {
      const body = (request as { body?: unknown }).body;
      await mcpHandler.handlePost(request.raw, reply.raw, body);
    });
    server.get("/mcp", async (request, reply) => {
      await mcpHandler.handleGet(request.raw, reply.raw);
    });
    server.delete("/mcp", async (request, reply) => {
      await mcpHandler.handleDelete(request.raw, reply.raw);
    });
  }

  server.get("/api/projects", {
    schema: {
      querystring: projectListQuerySchema
    }
  }, async (request, reply) => {
    const result = await projectService.listProjects(request.query.limit);
    return reply.status(200).send(result);
  });

  server.post("/api/projects", {
    schema: {
      body: createProjectInputSchema
    }
  }, async (request, reply) => {
    const result = await projectService.createProject(request.body);
    const project = result.context?.project;

    if (!project) {
      return reply.status(400).send(result);
    }

    return reply.status(201).send(project);
  });

  server.get("/api/goals", {
    schema: {
      querystring: goalListQuerySchema
    }
  }, async (request, reply) => {
    const result = await goalService.listGoals(request.query.projectId);
    return reply.status(200).send(result);
  });

  if (agentService) {
    server.get("/api/agents", {
      schema: {
        querystring: agentListQuerySchema
      }
    }, async (request, reply) => {
      const agents = await agentService.listAgents(request.query.limit);
      return reply.status(200).send({ agents });
    });
  }

  if (mcpLogStore) {
    server.get("/api/mcp-logs", {
      schema: {
        querystring: mcpLogListQuerySchema
      }
    }, async (request, reply) => {
      const logs = await mcpLogStore.listLogsByAgent(
        request.query.agentDisplayName,
        request.query.limit
      );
      return reply.status(200).send({ logs });
    });
  }

  server.get("/api/dashboard", {
    schema: {
      querystring: dashboardQuerySchema
    }
  }, async (request, reply) => {
    const query = request.query;
    const snapshot = await dashboardQueryService.getSnapshot(query);
    return reply.status(200).send(snapshot);
  });

  server.get("/api/dashboard/stream", {
    schema: {
      querystring: dashboardQuerySchema
    }
  }, async (request, reply) => {
    const query = request.query;

    const sendSnapshot = async () => {
      const snapshot = await dashboardQueryService.getSnapshot(query);
      const event = dashboardStreamEventDtoSchema.parse({
        type: "dashboard.snapshot",
        data: snapshot
      });
      reply.sse({
        event: event.type,
        data: JSON.stringify(event)
      });
    };

    await sendSnapshot();
    const timer = setInterval(() => {
      void sendSnapshot().catch((error: unknown) => {
        logger.info(
          "transport:http",
          error instanceof Error ? error.message : "Failed to emit dashboard snapshot."
        );
      });
    }, 5000);

    request.raw.on("close", () => {
      clearInterval(timer);
    });
  });

  server.get("/api/tasks", {
    schema: {
      querystring: taskListQuerySchema
    }
  }, async (request, reply) => {
    const query = request.query;
    const tasks = await taskQueryService.listTasks(query);
    return reply.status(200).send(tasks);
  });

  server.get("/api/tasks/:taskId/memory", {
    schema: {
      params: taskMemoryParamsSchema,
      querystring: taskMemoryQuerySchema
    }
  }, async (request, reply) => {
    try {
      const limit = request.query.limit ?? 50;
      const payload = await memoryQueryService.listForTask(request.params.taskId, limit);
      return reply.status(200).send(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(404).send({ error: message });
    }
  });

  server.get("/api/tasks/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const detail = await taskQueryService.getTaskDetail(taskId);
    return reply.status(detail.task ? 200 : 404).send(detail);
  });

  server.get("/api/memory", {
    schema: {
      querystring: memoryListQuerySchema
    }
  }, async (request, reply) => {
    try {
      const limit = request.query.limit ?? 100;
      const payload = await memoryQueryService.listForProject(request.query.projectId, limit);
      return reply.status(200).send(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(404).send({ error: message });
    }
  });

  server.get("/api/memory/search", {
    schema: {
      querystring: memorySearchQuerySchema
    }
  }, async (request, reply) => {
    try {
      const limit = request.query.limit ?? 16;
      const payload = await memoryQueryService.searchProject(
        request.query.projectId,
        request.query.query,
        limit
      );
      return reply.status(200).send(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(404).send({ error: message });
    }
  });

  server.get("/api/meta", async (request, reply) => {
    const normalizedPath = projectPath.replace(/\\/g, "/");
    return reply.status(200).send({
      name: appName,
      version: appVersion,
      projectPath: normalizedPath
    });
  });

  server.get("/api/validate-path", {
    schema: {
      querystring: { path: { type: "string" } }
    }
  }, async (request, reply) => {
    const { path: rawPath } = request.query as { path: string };
    const trimmed = rawPath?.trim() ?? "";
    if (!trimmed) {
      return reply.status(200).send({ valid: false, error: "Path is required." });
    }
    const resolved = resolve(projectPath, trimmed);
    if (!existsSync(resolved)) {
      return reply.status(200).send({ valid: false, error: "Path does not exist." });
    }
    const stat = statSync(resolved);
    const valid = stat.isDirectory();
    return reply.status(200).send({
      valid,
      resolved: valid ? resolved : undefined,
      error: valid ? undefined : "Path is not a directory."
    });
  });

  server.get("/api/fs/entries", {
    schema: {
      querystring: { path: { type: "string", default: "." } }
    }
  }, async (request, reply) => {
    const { path: rawPath } = request.query as { path: string };
    const trimmed = (rawPath ?? ".").trim() || ".";
    const resolved = resolve(projectPath, trimmed);
    const rel = relative(projectPath, resolved);
    if (rel.startsWith("..") || (process.platform === "win32" && /^[a-zA-Z]:/.test(rel))) {
      return reply.status(400).send({ error: "Path is outside project directory." });
    }
    try {
      const entries = readdirSync(resolved, { withFileTypes: true })
        .filter((e) => e.name !== "." && e.name !== "..")
        .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      return reply.status(200).send({ path: trimmed, resolvedPath: resolved, entries });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read directory.";
      return reply.status(400).send({ error: message });
    }
  });

  server.get("/api/fs/pick-folder", async (request, reply) => {
    try {
      const path = await showFolderPicker();
      return reply.status(200).send({ path });
    } catch (error) {
      return reply.status(500).send({ error: "Failed to open folder picker" });
    }
  });

  server.post("/api/shutdown", async (request, reply) => {
    await reply.status(200).send({ ok: true });
    setImmediate(() => process.kill(process.pid, "SIGTERM"));
  });

  server.setErrorHandler((error: any, request, reply) => {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    logger.info("transport:http", message);
    return reply.status(error.statusCode || 500).send({
      error: "internal_server_error",
      message
    });
  });

  return {
    async start(): Promise<void> {
      await server.listen({ port, host: "0.0.0.0" });
      logger.info("transport:http", `OpenTasks HTTP server is listening on port ${port}.`);
    },
    async close(): Promise<void> {
      await server.close();
    }
  };
}
