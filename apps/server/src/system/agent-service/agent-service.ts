import type { Logger } from "../../infra/logging";
import type { AgentRecord, AgentStore } from "../../infra/storage/agent-store";

export interface ClientInfo {
  name?: string;
  version?: string;
}

export interface AgentService {
  getOrCreateAgentByClientName(clientInfo?: ClientInfo): Promise<AgentRecord>;
  getAgent(agentId: string): Promise<AgentRecord | null>;
  listAgents(limit?: number): Promise<AgentRecord[]>;
  touchLastSeen(agentId: string): Promise<void>;
  touchLastSeenByDisplayName(displayName: string): Promise<void>;
}

export function createAgentService({
  logger,
  agentStore
}: {
  logger: Logger;
  agentStore: AgentStore;
}): AgentService {
  return {
    async getOrCreateAgentByClientName(clientInfo?: ClientInfo): Promise<AgentRecord> {
      const clientName = clientInfo?.name?.trim();
      const displayName = clientName ?? `unknown-${Date.now().toString(36)}`;

      if (clientName) {
        const existing = await agentStore.getAgentByClientName(clientName);
        if (existing) {
          await agentStore.touchLastSeen(existing.id);
          logger.step("agent-service", `Reusing agent ${existing.displayName} for client "${clientName}".`);
          return existing;
        }
      }

      const agent = await agentStore.createAgent({
        displayName,
        clientName: clientName ?? null,
        clientVersion: clientInfo?.version ?? null
      });
      logger.step("agent-service", `Created agent ${agent.id} for client "${displayName}".`);
      return agent;
    },

    async getAgent(agentId: string): Promise<AgentRecord | null> {
      return agentStore.getAgent(agentId);
    },

    async listAgents(limit?: number): Promise<AgentRecord[]> {
      return agentStore.listAgents(limit);
    },

    async touchLastSeen(agentId: string): Promise<void> {
      return agentStore.touchLastSeen(agentId);
    },

    async touchLastSeenByDisplayName(displayName: string): Promise<void> {
      const agent = await agentStore.getAgentByDisplayName(displayName);
      if (agent) {
        await agentStore.touchLastSeen(agent.id);
      }
    }
  };
}
