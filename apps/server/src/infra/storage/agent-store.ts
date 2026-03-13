export interface AgentRecord {
  id: string;
  displayName: string;
  clientName: string | null;
  clientVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface CreateAgentInput {
  displayName: string;
  clientName?: string | null;
  clientVersion?: string | null;
}

export interface AgentStore {
  createAgent(input: CreateAgentInput): Promise<AgentRecord>;
  getAgent(agentId: string): Promise<AgentRecord | null>;
  getAgentByDisplayName(displayName: string): Promise<AgentRecord | null>;
  getAgentByClientName(clientName: string): Promise<AgentRecord | null>;
  listAgents(limit?: number): Promise<AgentRecord[]>;
  touchLastSeen(agentId: string): Promise<void>;
}
