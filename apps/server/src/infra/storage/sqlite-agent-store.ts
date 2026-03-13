import type { Database } from "better-sqlite3";
import { generateId } from "./sqlite-schema";
import type { AgentRecord, AgentStore, CreateAgentInput } from "./agent-store";

interface CreateSqliteAgentStoreParams {
  db: Database;
}

function mapRow(row: {
  id: string;
  display_name: string;
  client_name: string | null;
  client_version: string | null;
  created_at: string;
  last_seen_at: string;
}): AgentRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    clientName: row.client_name,
    clientVersion: row.client_version,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

export function createSqliteAgentStore({ db }: CreateSqliteAgentStoreParams): AgentStore {
  const insert = db.prepare(`
    INSERT INTO agents (id, display_name, client_name, client_version)
    VALUES (?, ?, ?, ?)
  `);

  const selectById = db.prepare(`
    SELECT id, display_name, client_name, client_version, created_at, last_seen_at
    FROM agents
    WHERE id = ?
  `);

  const selectByDisplayName = db.prepare(`
    SELECT id, display_name, client_name, client_version, created_at, last_seen_at
    FROM agents
    WHERE display_name = ?
  `);

  const selectByClientName = db.prepare(`
    SELECT id, display_name, client_name, client_version, created_at, last_seen_at
    FROM agents
    WHERE client_name = ?
    ORDER BY last_seen_at DESC
    LIMIT 1
  `);

  const selectAll = db.prepare(`
    SELECT id, display_name, client_name, client_version, created_at, last_seen_at
    FROM agents
    ORDER BY last_seen_at DESC
  `);

  const updateLastSeen = db.prepare(`
    UPDATE agents
    SET last_seen_at = datetime('now')
    WHERE id = ?
  `);

  return {
    async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
      const id = generateId("agent");
      insert.run(
        id,
        input.displayName,
        input.clientName ?? null,
        input.clientVersion ?? null
      );
      const row = selectById.get(id) as Parameters<typeof mapRow>[0];
      return mapRow(row);
    },

    async getAgent(agentId: string): Promise<AgentRecord | null> {
      const row = selectById.get(agentId) as Parameters<typeof mapRow>[0] | undefined;
      return row ? mapRow(row) : null;
    },

    async getAgentByDisplayName(displayName: string): Promise<AgentRecord | null> {
      const row = selectByDisplayName.get(displayName) as Parameters<typeof mapRow>[0] | undefined;
      return row ? mapRow(row) : null;
    },

    async getAgentByClientName(clientName: string): Promise<AgentRecord | null> {
      const row = selectByClientName.get(clientName) as Parameters<typeof mapRow>[0] | undefined;
      return row ? mapRow(row) : null;
    },

    async listAgents(limit?: number): Promise<AgentRecord[]> {
      const rows = (limit ? selectAll.all().slice(0, limit) : selectAll.all()) as Array<
        Parameters<typeof mapRow>[0]
      >;
      return rows.map(mapRow);
    },

    async touchLastSeen(agentId: string): Promise<void> {
      updateLastSeen.run(agentId);
    }
  };
}
