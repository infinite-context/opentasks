import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientRuntimeCapability } from "@opentasks/contracts";
import { MCP_SERVER_INSTRUCTIONS } from "./mcp-instructions.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AgentService } from "../../system/agent-service";
import { registerMcpTools } from "./mcp-tools.js";
import type { McpTransport } from "./types.js";
import type { McpToolsServices } from "./mcp-tools.js";

import type { McpLogStore } from "../../infra/storage/mcp-log-store";

export interface CreateMcpStdioTransportParams extends McpToolsServices {
  appName: string;
  appVersion: string;
  logger: { section: (name: string) => void; info: (tag: string, msg: string) => void };
  agentService?: AgentService;
  mcpLogStore?: McpLogStore;
}

/**
 * Creates the stdio MCP transport. Uses caller-supplied agentName from tool args
 * for backward compatibility until session-bound identity is fully adopted.
 */
export function createMcpStdioTransport(params: CreateMcpStdioTransportParams): McpTransport {
  const { logger, appName, appVersion, agentService, mcpLogStore, ...services } = params;
  let clientCapability: ClientRuntimeCapability = "black_box";

  const getAgentForRequest: (args: { agentName?: string }, _extra?: { sessionId?: string }) => Promise<string> = async (args) => {
    if (!args.agentName || args.agentName.trim() === "") {
      throw new Error(
        "agentName is required for task lifecycle tools. Provide agentName in the tool arguments."
      );
    }
    return args.agentName;
  };

  const server = new McpServer(
    { name: appName, version: appVersion },
    { instructions: MCP_SERVER_INSTRUCTIONS }
  );

  registerMcpTools(server, {
    ...services,
    getAgentForRequest,
    getClientCapabilityForRequest: async () => clientCapability,
    setClientCapabilityForRequest: async (capability) => {
      clientCapability = capability;
    },
    logStore: mcpLogStore,
    agentService
  });

  let transport: StdioServerTransport | null = null;

  return {
    async start(): Promise<void> {
      logger.section("MCP Transport");
      logger.info("transport:mcp", "Starting OpenTasks MCP server over stdio.");
      transport = new StdioServerTransport();
      await server.connect(transport);
    },
    async close(): Promise<void> {
      await server.close();
      if (transport) {
        await transport.close();
      }
    }
  };
}
