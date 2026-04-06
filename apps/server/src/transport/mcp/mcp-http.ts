import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { ClientRuntimeCapability } from "@opentasks/contracts";
import { MCP_SERVER_INSTRUCTIONS } from "./mcp-instructions.js";
import { registerMcpTools } from "./mcp-tools.js";
import type { McpToolsServices } from "./mcp-tools.js";
import type { AgentService } from "../../system/agent-service";
import type { AgentRecord } from "../../infra/storage/agent-store";

import type { McpLogStore } from "../../infra/storage/mcp-log-store";

export interface CreateMcpHttpHandlerParams extends McpToolsServices {
  appName: string;
  appVersion: string;
  logger: { info: (tag: string, msg: string) => void };
  agentService: AgentService;
  mcpLogStore?: McpLogStore;
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  agent: AgentRecord;
  capability: ClientRuntimeCapability;
}

/**
 * Creates the HTTP MCP handler that assigns each session an agent and binds
 * tool calls to that agent without requiring agentName in the request.
 */
export function createMcpHttpHandler(params: CreateMcpHttpHandlerParams): {
  handlePost: (req: IncomingMessage, res: ServerResponse, body?: unknown) => Promise<void>;
  handleGet: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handleDelete: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} {
  const { logger, appName, appVersion, agentService, mcpLogStore, ...services } = params;
  const sessions = new Map<string, SessionEntry>();

  function resolveSessionId(extra?: {
    sessionId?: string;
    requestInfo?: { headers?: Record<string, string | string[] | undefined> };
  }): string | null {
    return (
      extra?.sessionId ??
      (typeof extra?.requestInfo?.headers?.["mcp-session-id"] === "string"
        ? extra.requestInfo.headers["mcp-session-id"]
        : Array.isArray(extra?.requestInfo?.headers?.["mcp-session-id"])
          ? extra.requestInfo.headers["mcp-session-id"][0]
          : null)
    );
  }

  function getAgentForRequest(
    _args: { agentName?: string },
    extra?: { sessionId?: string; requestInfo?: { headers?: Record<string, string | string[] | undefined> } }
  ): Promise<string> {
    const sessionId = resolveSessionId(extra);
    if (!sessionId) {
      return Promise.reject(
        new Error("No session ID. Ensure the client has completed MCP initialization.")
      );
    }
    const entry = sessions.get(sessionId);
    if (!entry) {
      return Promise.reject(new Error(`Session ${sessionId} not found or expired.`));
    }
    return Promise.resolve(entry.agent.displayName);
  }

  function getClientCapabilityForRequest(
    extra?: { sessionId?: string; requestInfo?: { headers?: Record<string, string | string[] | undefined> } }
  ): Promise<ClientRuntimeCapability> {
    const sessionId = resolveSessionId(extra);
    if (!sessionId) {
      return Promise.resolve("black_box");
    }

    const entry = sessions.get(sessionId);
    if (!entry) {
      return Promise.resolve("black_box");
    }

    return Promise.resolve(entry.capability);
  }

  function setClientCapabilityForRequest(
    capability: ClientRuntimeCapability,
    extra?: { sessionId?: string; requestInfo?: { headers?: Record<string, string | string[] | undefined> } }
  ): Promise<void> {
    const sessionId = resolveSessionId(extra);
    if (!sessionId) {
      return Promise.resolve();
    }

    const entry = sessions.get(sessionId);
    if (!entry) {
      return Promise.resolve();
    }

    entry.capability = capability;
    return Promise.resolve();
  }

  function createServer(): McpServer {
    const server = new McpServer(
      { name: appName, version: appVersion },
      { instructions: MCP_SERVER_INSTRUCTIONS }
    );
    registerMcpTools(server, {
      ...services,
      getAgentForRequest,
      getClientCapabilityForRequest,
      setClientCapabilityForRequest,
      logStore: mcpLogStore,
      agentService
    });
    return server;
  }

  async function handlePost(
    req: IncomingMessage,
    res: ServerResponse,
    body?: unknown
  ): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      if (sessionId && sessions.has(sessionId)) {
        const entry = sessions.get(sessionId)!;
        await entry.transport.handleRequest(req, res, body);
        return;
      }

      if (!sessionId && body && isInitializeRequest(body)) {
        const initParams = (body as { params?: Record<string, unknown> }).params;
        const clientInfo = initParams?.clientInfo as { name?: string; version?: string } | undefined;

        // Log all connection info received from the incoming connection
        const connectionInfo = {
          http: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            remoteAddress: req.socket?.remoteAddress,
            remotePort: req.socket?.remotePort,
            localAddress: req.socket?.localAddress,
            localPort: req.socket?.localPort
          },
          mcp: {
            initializeParams: initParams
          }
        };
        logger.info("transport:mcp-http", `Agent connection: ${JSON.stringify(connectionInfo)}`);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: async (sid) => {
            const agent = await agentService.getOrCreateAgentByClientName({
              name: clientInfo?.name,
              version: clientInfo?.version
            });
            sessions.set(sid, { transport, server, agent, capability: "black_box" });
            logger.info("transport:mcp-http", `Session ${sid} bound to agent ${agent.displayName}.`);
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            sessions.delete(sid);
            logger.info("transport:mcp-http", `Session ${sid} closed.`);
          }
        };

        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID or initialization required." },
          id: null
        })
      );
    } catch (err) {
      logger.info(
        "transport:mcp-http",
        err instanceof Error ? err.message : String(err)
      );
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null
          })
        );
      }
    }
  }

  async function handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.statusCode = 400;
      res.end("Invalid or missing session ID");
      return;
    }
    const entry = sessions.get(sessionId)!;
    await entry.transport.handleRequest(req, res);
  }

  async function handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.statusCode = 400;
      res.end("Invalid or missing session ID");
      return;
    }
    try {
      const entry = sessions.get(sessionId)!;
      await entry.transport.handleRequest(req, res);
      sessions.delete(sessionId);
    } catch (err) {
      logger.info(
        "transport:mcp-http",
        err instanceof Error ? err.message : String(err)
      );
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Error processing session termination");
      }
    }
  }

  return { handlePost, handleGet, handleDelete };
}
