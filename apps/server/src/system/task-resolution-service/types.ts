import type { TaskQueryResolutionDto, TaskSearchQuery } from "@opentasks/contracts";

export interface TaskResolutionService {
  recommendTaskForQuery(query: TaskSearchQuery): Promise<TaskQueryResolutionDto>;
}
