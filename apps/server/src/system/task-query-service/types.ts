import type {
  TaskDetailDto,
  TaskListDto,
  TaskListQuery,
  TaskSearchQuery,
  TaskSearchResultDto
} from "@opentasks/contracts";

export interface TaskQueryService {
  getTaskDetail(taskId: string): Promise<TaskDetailDto>;
  listTasks(query?: TaskListQuery): Promise<TaskListDto>;
  searchTasks(query: TaskSearchQuery): Promise<TaskSearchResultDto>;
}
