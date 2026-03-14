import type { Logger } from "../logging";
import type { MemoryArtifact, RetrievedContextItem } from "@opentasks/contracts";

export interface VectorSearchQuery {
  projectId: string;
  goalId?: string;
  taskId?: string;
}

export interface VectorDatabase {
  search(query: VectorSearchQuery): Promise<RetrievedContextItem[]>;
  upsert(artifacts: MemoryArtifact[]): Promise<void>;
}

interface CreateVectorDatabaseParams {
  logger: Logger;
}

export function createVectorDatabase({ logger }: CreateVectorDatabaseParams): VectorDatabase {
  return {
    async search(query: VectorSearchQuery): Promise<RetrievedContextItem[]> {
      logger.step(
        "storage:vector-db",
        `Vector database returns reusable context candidates for project \"${query.projectId}\".`
      );

      const projectScopedItems: RetrievedContextItem[] = [
        {
          id: `ctx_instruction_${query.taskId ?? query.projectId}`,
          kind: "instruction",
          projectId: query.projectId,
          goalId: query.goalId ?? null,
          taskId: query.taskId ?? null,
          content:
            "Hydrate task context with the smallest useful set of retrieved items before work begins.",
          summary: "Prefer minimal, task-specific hydration.",
          tags: ["hydration", "instruction", "execution-loop"],
          score: 0.92
        },
        {
          id: `ctx_architecture_${query.goalId ?? query.projectId}`,
          kind: "architecture_note",
          projectId: query.projectId,
          goalId: query.goalId ?? null,
          content:
            "Task orchestration is goal-aware. Hydration should enrich an already-selected task and must not decide which task to claim.",
          summary: "Hydration is downstream of orchestration.",
          tags: ["architecture", "goals", "hydration"],
          score: 0.84
        },
        {
          id: `ctx_file_${query.projectId}`,
          kind: "file_summary",
          projectId: query.projectId,
          goalId: query.goalId ?? null,
          content:
            "The context hydrator coordinates retrieval-backed task enrichment and packages the result into a structured context packet.",
          summary: "context-hydrator module summary",
          filePath: "apps/server/src/system/context-hydrator/context-hydrator.ts",
          tags: ["context-hydrator", "file-summary"],
          score: 0.8
        },
        {
          id: `ctx_symbol_${query.projectId}`,
          kind: "symbol_summary",
          projectId: query.projectId,
          goalId: query.goalId ?? null,
          content:
            "createVectorSearchEngine filters retrieval items to the selected project and prefers goal-scoped and task-scoped context.",
          summary: "vector search engine behavior",
          filePath: "apps/server/src/system/vector-search-engine/vector-search-engine.ts",
          symbolName: "createVectorSearchEngine",
          tags: ["vector-search-engine", "retrieval"],
          score: 0.78
        },
        {
          id: `ctx_run_${query.taskId ?? query.projectId}`,
          kind: "run_note",
          projectId: query.projectId,
          goalId: query.goalId ?? null,
          taskId: query.taskId ?? null,
          content:
            "A prior runnable skeleton pass showed that returning structured retrieval items is more useful than returning only memory strings.",
          summary: "Prior run note for the current task scope.",
          tags: ["run-note", "context-packet"],
          score: 0.88
        }
      ];

      return projectScopedItems.map((item) => ({
        ...item,
        score:
          item.taskId && query.taskId && item.taskId === query.taskId
            ? 1
            : item.goalId && query.goalId && item.goalId === query.goalId
              ? 0.9
              : item.score ?? 0.75
      }));
    },
    async upsert(artifacts: MemoryArtifact[]): Promise<void> {
      logger.step(
        "storage:vector-db",
        `Vector database stores ${artifacts.length} generated memory artifact(s) for future runs.`
      );
    }
  };
}
