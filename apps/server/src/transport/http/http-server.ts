import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  dashboardQuerySchema,
  dashboardStreamEventDtoSchema,
  taskListQuerySchema
} from "@opentasks/contracts/schemas";
import type { Logger } from "../../infra/logging";
import type { DashboardQueryService } from "../../system/dashboard-query-service";
import type { TaskQueryService } from "../../system/task-query-service";
import type { HttpTransport } from "./types";

interface CreateHttpTransportParams {
  logger: Logger;
  appName: string;
  appVersion: string;
  projectPath: string;
  port: number;
  dashboardQueryService: DashboardQueryService;
  taskQueryService: TaskQueryService;
}

export function createHttpTransport({
  logger,
  appName,
  appVersion,
  projectPath,
  port,
  dashboardQueryService,
  taskQueryService
}: CreateHttpTransportParams): HttpTransport {
  const server = createServer(async (request, response) => {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      await handleRequest(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      logger.info("transport:http", message);

      if (!response.headersSent) {
        sendJson(response, 500, {
          error: "internal_server_error",
          message
        });
      } else {
        response.end();
      }
    }
  });

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    if (url.pathname === "/api/dashboard") {
      const query = dashboardQuerySchema.parse({
        projectId: emptyToUndefined(url.searchParams.get("projectId"))
      });
      const snapshot = await dashboardQueryService.getSnapshot(query);
      sendJson(response, 200, snapshot);
      return;
    }

    if (url.pathname === "/api/dashboard/stream") {
      const query = dashboardQuerySchema.parse({
        projectId: emptyToUndefined(url.searchParams.get("projectId"))
      });

      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });
      response.write("retry: 5000\n\n");

      const sendSnapshot = async () => {
        const snapshot = await dashboardQueryService.getSnapshot(query);
        const event = dashboardStreamEventDtoSchema.parse({
          type: "dashboard.snapshot",
          data: snapshot
        });

        response.write(`event: ${event.type}\n`);
        response.write(`data: ${JSON.stringify(event)}\n\n`);
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

      request.on("close", () => {
        clearInterval(timer);
        response.end();
      });
      return;
    }

    if (url.pathname === "/api/tasks") {
      const statusParams = url.searchParams.getAll("status").flatMap((value) => value.split(","));
      const query = taskListQuerySchema.parse({
        projectId: emptyToUndefined(url.searchParams.get("projectId")),
        status: statusParams.length > 0 ? statusParams.filter(Boolean) : undefined,
        assignedTo: emptyToUndefined(url.searchParams.get("assignedTo")),
        limit: emptyToUndefined(url.searchParams.get("limit"))
      });

      const tasks = await taskQueryService.listTasks(query);
      sendJson(response, 200, tasks);
      return;
    }

    if (url.pathname.startsWith("/api/tasks/")) {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", ""));
      const detail = await taskQueryService.getTaskDetail(taskId);
      sendJson(response, detail.task ? 200 : 404, detail);
      return;
    }

    if (url.pathname === "/api/meta") {
      const normalizedPath = projectPath.replace(/\\/g, "/");
      sendJson(response, 200, {
        name: appName,
        version: appVersion,
        projectPath: normalizedPath
      });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  }

  return {
    async start(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, () => {
          server.off("error", reject);
          logger.info("transport:http", `OpenTasks HTTP server is listening on port ${port}.`);
          resolve();
        });
      });
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

function emptyToUndefined(value: string | null): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}
