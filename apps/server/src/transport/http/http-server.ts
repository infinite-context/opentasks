import fastify from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { FastifySSEPlugin } from "fastify-sse-v2";
import {
  createProjectInputSchema,
  dashboardQuerySchema,
  dashboardStreamEventDtoSchema,
  projectListQuerySchema,
  taskListQuerySchema
} from "@opentasks/contracts/schemas";
import type { Logger } from "../../infra/logging";
import type { DashboardQueryService } from "../../system/dashboard-query-service";
import type { ProjectService } from "../../system/project-service";
import type { TaskQueryService } from "../../system/task-query-service";
import type { HttpTransport } from "./types";

interface CreateHttpTransportParams {
  logger: Logger;
  appName: string;
  appVersion: string;
  projectPath: string;
  port: number;
  projectService: ProjectService;
  dashboardQueryService: DashboardQueryService;
  taskQueryService: TaskQueryService;
}

export function createHttpTransport({
  logger,
  appName,
  appVersion,
  projectPath,
  port,
  projectService,
  dashboardQueryService,
  taskQueryService
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
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  });

  server.options("*", async (request, reply) => {
    return reply.status(204).send();
  });

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

  server.get("/api/tasks/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const detail = await taskQueryService.getTaskDetail(taskId);
    return reply.status(detail.task ? 200 : 404).send(detail);
  });

  server.get("/api/meta", async (request, reply) => {
    const normalizedPath = projectPath.replace(/\\/g, "/");
    return reply.status(200).send({
      name: appName,
      version: appVersion,
      projectPath: normalizedPath
    });
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
