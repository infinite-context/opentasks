import type { TaskDetailDto, TaskListDto, TaskListQuery } from "../../shared/dtos";

export interface TaskQueryService {
  getTaskDetail(taskId: string): Promise<TaskDetailDto>;
  listTasks(query?: TaskListQuery): Promise<TaskListDto>;
}
