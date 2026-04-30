import type { Logger } from "../../infra/logging";
import type { CoordinationStore } from "../../infra/storage/task-store";
import type { MemoryArtifactReader } from "../../infra/storage/memory-artifact-reader";
import type { VectorDatabase } from "../../infra/storage/vector-database";
import type {
  DashboardMemoryArtifactSummaryDto,
  MemoryArtifactListResponseDto,
  MemorySearchResponseDto
} from "@opentasks/contracts";
import type { MemoryQueryService } from "./types";

interface CreateMemoryQueryServiceParams {
  logger: Logger;
  taskStore: CoordinationStore;
  memoryArtifactReader: MemoryArtifactReader;
  vectorDatabase: VectorDatabase;
}

export function createMemoryQueryService({
  logger,
  taskStore,
  memoryArtifactReader,
  vectorDatabase
}: CreateMemoryQueryServiceParams): MemoryQueryService {
  async function resolveProjectId(projectRef: string): Promise<string | null> {
    const project = await taskStore.getProject(projectRef);
    return project?.id ?? null;
  }

  return {
    async listForProject(projectRef: string, limit: number): Promise<MemoryArtifactListResponseDto> {
      logger.step("memory-query-service", `Listing memory artifacts for project "${projectRef}".`);
      const projectId = await resolveProjectId(projectRef);
      if (!projectId) {
        throw new Error(`Project "${projectRef}" was not found.`);
      }

      const capped = Math.min(Math.max(limit, 1), 500);
      const total = memoryArtifactReader.countByProject(projectId);
      const artifacts = memoryArtifactReader.listByProject(projectId, capped);
      return { projectId, total, artifacts };
    },

    async listForTask(taskId: string, limit: number): Promise<{ taskId: string; artifacts: DashboardMemoryArtifactSummaryDto[] }> {
      logger.step("memory-query-service", `Listing memory artifacts for task "${taskId}".`);
      const task = await taskStore.getTaskById(taskId);
      if (!task) {
        throw new Error(`Task "${taskId}" was not found.`);
      }

      const capped = Math.min(Math.max(limit, 1), 200);
      const artifacts = memoryArtifactReader.listByTask(taskId, capped);
      return { taskId, artifacts };
    },

    async searchProject(projectRef: string, query: string, limit: number): Promise<MemorySearchResponseDto> {
      logger.step("memory-query-service", `Searching learned memory for project "${projectRef}".`);
      const projectId = await resolveProjectId(projectRef);
      if (!projectId) {
        throw new Error(`Project "${projectRef}" was not found.`);
      }

      const capped = Math.min(Math.max(limit, 1), 50);
      const items = await vectorDatabase.search({
        text: query,
        projectId,
        limit: capped
      });

      return { projectId, query, items };
    }
  };
}
