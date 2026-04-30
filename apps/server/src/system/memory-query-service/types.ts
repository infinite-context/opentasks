import type {
  DashboardMemoryArtifactSummaryDto,
  MemoryArtifactListResponseDto,
  MemorySearchResponseDto
} from "@opentasks/contracts";

export interface MemoryQueryService {
  listForProject(projectRef: string, limit: number): Promise<MemoryArtifactListResponseDto>;
  listForTask(taskId: string, limit: number): Promise<{ taskId: string; artifacts: DashboardMemoryArtifactSummaryDto[] }>;
  searchProject(projectRef: string, query: string, limit: number): Promise<MemorySearchResponseDto>;
}
