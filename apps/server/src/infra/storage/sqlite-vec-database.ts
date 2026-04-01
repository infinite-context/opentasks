import type { Database } from "better-sqlite3";
import type { MemoryArtifact, RetrievedContextItem } from "@opentasks/contracts";
import type { Logger } from "../logging";
import type { EmbeddingProvider } from "../providers/embedding-provider";
import type { VectorDatabase, VectorSearchQuery } from "./vector-database";

interface CreateSqliteVecDatabaseParams {
  logger: Logger;
  db: Database;
  embeddingProvider: EmbeddingProvider;
}

interface TaskScopeRow {
  projectId: string;
  goalId: string | null;
}

interface SearchRow {
  externalId: string;
  projectId: string;
  goalId: string | null;
  taskId: string;
  kind: RetrievedContextItem["kind"];
  content: string;
  summary: string | null;
  distance: number | null;
}

interface PersistableArtifact {
  externalId: string;
  taskId: string;
  goalId: string;
  projectId: string;
  kind: MemoryArtifact["kind"];
  content: string;
  summary: string;
  source: MemoryArtifact["source"];
  embedding: number[];
}

const DEFAULT_SEARCH_LIMIT = 8;

export function createSqliteVecDatabase({
  logger,
  db,
  embeddingProvider
}: CreateSqliteVecDatabaseParams): VectorDatabase {
  return {
    async upsert(artifacts: MemoryArtifact[]): Promise<void> {
      if (artifacts.length === 0) {
        return;
      }

      const taskScopeStatement = db.prepare(`
        SELECT project_id AS projectId, goal_id AS goalId
        FROM tasks
        WHERE id = ?
        LIMIT 1
      `);

      const persistableArtifacts: PersistableArtifact[] = [];

      for (const artifact of artifacts) {
        try {
          const taskScope = taskScopeStatement.get(artifact.taskId) as TaskScopeRow | undefined;

          if (!taskScope?.projectId || !taskScope.goalId) {
            logger.info(
              "storage:sqlite-vec",
              `Skipping memory artifact "${artifact.id}" because task "${artifact.taskId}" has no project/goal scope.`
            );
            continue;
          }

          const embedding = normalizeEmbedding(
            await embeddingProvider.embed(resolveArtifactEmbeddingText(artifact)),
            embeddingProvider.dimensions
          );

          persistableArtifacts.push({
            externalId: artifact.id,
            taskId: artifact.taskId,
            goalId: taskScope.goalId,
            projectId: taskScope.projectId,
            kind: artifact.kind,
            content: artifact.content,
            summary: artifact.summary,
            source: artifact.source,
            embedding
          });
        } catch (error) {
          logger.info(
            "storage:sqlite-vec",
            `Failed to prepare memory artifact "${artifact.id}" for indexing. ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (persistableArtifacts.length === 0) {
        return;
      }

      try {
        const persistArtifacts = db.transaction((rows: PersistableArtifact[]) => {
          const upsertMetadata = db.prepare(`
            INSERT INTO memory_artifacts (
              external_id,
              task_id,
              goal_id,
              project_id,
              kind,
              content,
              summary,
              source
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(external_id) DO UPDATE SET
              task_id = excluded.task_id,
              goal_id = excluded.goal_id,
              project_id = excluded.project_id,
              kind = excluded.kind,
              content = excluded.content,
              summary = excluded.summary,
              source = excluded.source
            RETURNING id
          `);
          const deleteVectorRow = db.prepare(`
            DELETE FROM memory_artifacts_vec
            WHERE rowid = ?
          `);

          for (const row of rows) {
            const metadataRow = upsertMetadata.get(
              row.externalId,
              row.taskId,
              row.goalId,
              row.projectId,
              row.kind,
              row.content,
              row.summary,
              row.source
            ) as { id: number } | undefined;

            if (!metadataRow || !Number.isSafeInteger(metadataRow.id)) {
              throw new Error(`Memory artifact "${row.externalId}" did not return a stable row id.`);
            }

            deleteVectorRow.run(metadataRow.id);
            db.prepare(`
              INSERT INTO memory_artifacts_vec (rowid, embedding)
              VALUES (${metadataRow.id}, ?)
            `).run(serializeEmbedding(row.embedding));
          }
        });

        persistArtifacts(persistableArtifacts);

        logger.step(
          "storage:sqlite-vec",
          `SQLite vector database stored ${persistableArtifacts.length} memory artifact(s).`
        );
      } catch (error) {
        logger.info(
          "storage:sqlite-vec",
          `SQLite vector upsert failed. ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    async search(query: VectorSearchQuery): Promise<RetrievedContextItem[]> {
      try {
        const embedding = normalizeEmbedding(
          await embeddingProvider.embed(query.text),
          embeddingProvider.dimensions
        );

        const rows = db.prepare(`
          SELECT
            memory_artifacts.external_id AS externalId,
            memory_artifacts.project_id AS projectId,
            memory_artifacts.goal_id AS goalId,
            memory_artifacts.task_id AS taskId,
            memory_artifacts.kind AS kind,
            memory_artifacts.content AS content,
            memory_artifacts.summary AS summary,
            distance
          FROM memory_artifacts_vec
          JOIN memory_artifacts
            ON memory_artifacts.id = memory_artifacts_vec.rowid
          WHERE memory_artifacts_vec.embedding MATCH ?
            AND k = ?
            AND memory_artifacts.project_id = ?
          ORDER BY distance ASC
        `).all(
          serializeEmbedding(embedding),
          resolveSearchLimit(query.limit),
          query.projectId
        ) as SearchRow[];

        logger.step(
          "storage:sqlite-vec",
          `SQLite vector database returned ${rows.length} retrieval item(s) for project "${query.projectId}".`
        );

        return rows.map(mapSearchRowToRetrievedItem);
      } catch (error) {
        logger.info(
          "storage:sqlite-vec",
          `SQLite vector search failed. Returning no retrieval items. ${error instanceof Error ? error.message : String(error)}`
        );

        return [];
      }
    }
  };
}

function mapSearchRowToRetrievedItem(row: SearchRow): RetrievedContextItem {
  return {
    id: row.externalId,
    kind: row.kind,
    projectId: row.projectId,
    goalId: row.goalId,
    taskId: row.taskId,
    content: row.content,
    summary: row.summary,
    tags: ["contextual-indexing", row.kind.replace(/_/g, "-")],
    score: scoreFromDistance(row.distance)
  };
}

function resolveArtifactEmbeddingText(artifact: MemoryArtifact): string {
  return `${artifact.summary}\n\n${artifact.content}`.trim();
}

function normalizeEmbedding(embedding: number[], dimensions: number): number[] {
  return Array.from({ length: dimensions }, (_, index) => {
    const value = embedding[index];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
}

function serializeEmbedding(embedding: number[]): string {
  return JSON.stringify(embedding);
}

function resolveSearchLimit(limit: number | undefined): number {
  if (typeof limit === "number" && Number.isInteger(limit) && limit > 0) {
    return limit;
  }

  return DEFAULT_SEARCH_LIMIT;
}

function scoreFromDistance(distance: number | null): number {
  if (typeof distance !== "number" || !Number.isFinite(distance)) {
    return 0;
  }

  return 1 / (1 + distance);
}
