import type { Database } from "better-sqlite3";
import { generateId } from "./sqlite-schema";
import type { CreateMcpLogInput, McpLogRecord, McpLogStore } from "./mcp-log-store";

interface CreateSqliteMcpLogStoreParams {
  db: Database;
}

function mapRow(row: {
  id: string;
  agent_display_name: string | null;
  tool_name: string;
  args_json: string;
  result_json: string | null;
  result_status: string;
  error_message: string | null;
  created_at: string;
}): McpLogRecord {
  return {
    id: row.id,
    agentDisplayName: row.agent_display_name,
    toolName: row.tool_name,
    argsJson: row.args_json,
    resultJson: row.result_json ?? null,
    resultStatus: row.result_status === "error" ? "error" : "ok",
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

export function createSqliteMcpLogStore({ db }: CreateSqliteMcpLogStoreParams): McpLogStore {
  const insert = db.prepare(`
    INSERT INTO mcp_logs (id, agent_display_name, tool_name, args_json, result_json, result_status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const selectByAgent = db.prepare(`
    SELECT id, agent_display_name, tool_name, args_json, result_json, result_status, error_message, created_at
    FROM mcp_logs
    WHERE agent_display_name = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return {
    async insertLog(input: CreateMcpLogInput): Promise<McpLogRecord> {
      const id = generateId("mcp_log");
      insert.run(
        id,
        input.agentDisplayName,
        input.toolName,
        JSON.stringify(input.args),
        input.resultJson ?? null,
        input.resultStatus,
        input.errorMessage ?? null
      );
      const row = db.prepare("SELECT * FROM mcp_logs WHERE id = ?").get(id) as Parameters<
        typeof mapRow
      >[0];
      return mapRow(row);
    },

    async listLogsByAgent(agentDisplayName: string, limit = 100): Promise<McpLogRecord[]> {
      const rows = selectByAgent.all(agentDisplayName, limit) as Array<
        Parameters<typeof mapRow>[0]
      >;
      return rows.map(mapRow);
    }
  };
}
