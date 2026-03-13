export interface McpLogRecord {
  id: string;
  agentDisplayName: string | null;
  toolName: string;
  argsJson: string;
  resultJson: string | null;
  resultStatus: "ok" | "error";
  errorMessage: string | null;
  createdAt: string;
}

export interface CreateMcpLogInput {
  agentDisplayName: string | null;
  toolName: string;
  args: Record<string, unknown>;
  resultStatus: "ok" | "error";
  resultJson?: string | null;
  errorMessage?: string | null;
}

export interface McpLogStore {
  insertLog(input: CreateMcpLogInput): Promise<McpLogRecord>;
  listLogsByAgent(agentDisplayName: string, limit?: number): Promise<McpLogRecord[]>;
}
