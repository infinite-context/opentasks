import { randomUUID } from "node:crypto";
import type { CreateMcpLogInput, McpLogRecord, McpLogStore } from "./mcp-log-store";

function currentTimestamp(): string {
  return new Date().toISOString();
}

export function createInMemoryMcpLogStore(): McpLogStore {
  const logs: McpLogRecord[] = [];

  return {
    async insertLog(input: CreateMcpLogInput): Promise<McpLogRecord> {
      const record: McpLogRecord = {
        id: `mcp_log_${randomUUID().replace(/-/g, "")}`,
        agentDisplayName: input.agentDisplayName,
        toolName: input.toolName,
        argsJson: JSON.stringify(input.args),
        resultJson: input.resultJson ?? null,
        resultStatus: input.resultStatus,
        errorMessage: input.errorMessage ?? null,
        createdAt: currentTimestamp()
      };
      logs.push(record);
      return { ...record };
    },

    async listLogsByAgent(agentDisplayName: string, limit = 100): Promise<McpLogRecord[]> {
      return logs
        .filter((log) => log.agentDisplayName === agentDisplayName)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)
        .map((r) => ({ ...r }));
    }
  };
}
