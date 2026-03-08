import type { TaskDetailDto, TaskListDto, TaskListQuery } from "@opentasks/contracts";

export interface TaskQueryService {
  getTaskDetail(taskId: string): Promise<TaskDetailDto>;
  listTasks(query?: TaskListQuery): Promise<TaskListDto>;
}
