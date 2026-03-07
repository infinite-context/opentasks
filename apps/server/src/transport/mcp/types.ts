import type { CompletedRun, HydratedTask, TaskRequest } from "../../shared/types";

export interface McpTransport {
  receiveTaskRequest(request: TaskRequest): Promise<TaskRequest>;
  returnHydratedTask(task: HydratedTask): Promise<void>;
  receiveCompletedRun(run: CompletedRun): Promise<CompletedRun>;
}
