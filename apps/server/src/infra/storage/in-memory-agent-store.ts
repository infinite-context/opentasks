import { randomUUID } from "node:crypto";
import type { AgentRecord, AgentStore, CreateAgentInput } from "./agent-store";

function currentTimestamp(): string {
  return new Date().toISOString();
}

export function createInMemoryAgentStore(): AgentStore {
  const agents = new Map<string, AgentRecord>();

  return {
    async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
      const id = `agent_${randomUUID().replace(/-/g, "")}`;
      const now = currentTimestamp();
      const record: AgentRecord = {
        id,
        displayName: input.displayName,
        clientName: input.clientName ?? null,
        clientVersion: input.clientVersion ?? null,
        createdAt: now,
        lastSeenAt: now
      };
      agents.set(id, record);
      return { ...record };
    },

    async getAgent(agentId: string): Promise<AgentRecord | null> {
      const record = agents.get(agentId);
      return record ? { ...record } : null;
    },

    async getAgentByDisplayName(displayName: string): Promise<AgentRecord | null> {
      for (const record of agents.values()) {
        if (record.displayName === displayName) {
          return { ...record };
        }
      }
      return null;
    },

    async getAgentByClientName(clientName: string): Promise<AgentRecord | null> {
      const matches = [...agents.values()]
        .filter((r) => r.clientName === clientName)
        .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
      return matches[0] ? { ...matches[0] } : null;
    },

    async listAgents(limit?: number): Promise<AgentRecord[]> {
      const records = [...agents.values()].sort(
        (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
      );
      return (limit ? records.slice(0, limit) : records).map((r) => ({ ...r }));
    },

    async touchLastSeen(agentId: string): Promise<void> {
      const record = agents.get(agentId);
      if (record) {
        record.lastSeenAt = currentTimestamp();
      }
    }
  };
}
