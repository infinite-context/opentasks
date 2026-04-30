import type { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { desc, eq } from "drizzle-orm";
import type { DashboardMemoryArtifactSummaryDto } from "@opentasks/contracts";
import * as schema from "./schema";

export interface MemoryArtifactReader {
  listByProject(projectId: string, limit: number): DashboardMemoryArtifactSummaryDto[];
  countByProject(projectId: string): number;
  listByTask(taskId: string, limit: number): DashboardMemoryArtifactSummaryDto[];
}

interface CreateSqliteMemoryArtifactReaderParams {
  db: Database;
}

export function createSqliteMemoryArtifactReader({
  db: sqliteDb
}: CreateSqliteMemoryArtifactReaderParams): MemoryArtifactReader {
  const db = drizzle(sqliteDb, { schema });

  return {
    listByProject(projectId: string, limit: number) {
      const rows = db
        .select({
          externalId: schema.memoryArtifacts.externalId,
          taskId: schema.memoryArtifacts.taskId,
          goalId: schema.memoryArtifacts.goalId,
          kind: schema.memoryArtifacts.kind,
          summary: schema.memoryArtifacts.summary,
          createdAt: schema.memoryArtifacts.createdAt
        })
        .from(schema.memoryArtifacts)
        .where(eq(schema.memoryArtifacts.projectId, projectId))
        .orderBy(desc(schema.memoryArtifacts.createdAt))
        .limit(limit)
        .all();

      return rows.map(mapRow);
    },

    countByProject(projectId: string) {
      const row = sqliteDb
        .prepare(`SELECT COUNT(*) AS n FROM memory_artifacts WHERE project_id = ?`)
        .get(projectId) as { n: number };
      return Number(row?.n ?? 0);
    },

    listByTask(taskId: string, limit: number) {
      const rows = db
        .select({
          externalId: schema.memoryArtifacts.externalId,
          taskId: schema.memoryArtifacts.taskId,
          goalId: schema.memoryArtifacts.goalId,
          kind: schema.memoryArtifacts.kind,
          summary: schema.memoryArtifacts.summary,
          createdAt: schema.memoryArtifacts.createdAt
        })
        .from(schema.memoryArtifacts)
        .where(eq(schema.memoryArtifacts.taskId, taskId))
        .orderBy(desc(schema.memoryArtifacts.createdAt))
        .limit(limit)
        .all();

      return rows.map(mapRow);
    }
  };
}

export function createNoopMemoryArtifactReader(): MemoryArtifactReader {
  return {
    listByProject() {
      return [];
    },
    countByProject() {
      return 0;
    },
    listByTask() {
      return [];
    }
  };
}

function mapRow(row: {
  externalId: string;
  taskId: string;
  goalId: string;
  kind: string;
  summary: string | null;
  createdAt: string;
}): DashboardMemoryArtifactSummaryDto {
  return {
    id: row.externalId,
    taskId: row.taskId,
    goalId: row.goalId,
    kind: row.kind,
    summary: row.summary,
    createdAt: row.createdAt
  };
}
