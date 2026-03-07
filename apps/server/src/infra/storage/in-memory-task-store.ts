import type { Logger } from "../logging";
import type { TaskRecord } from "../../shared/types";
import type { TaskStore } from "./task-store";

interface CreateInMemoryTaskStoreParams {
  logger: Logger;
  initialTasks?: TaskRecord[];
}

const defaultTasks: TaskRecord[] = [
  {
    id: "task-001",
    title: "Hydrate the next task with reusable context",
    projectId: "demo-project",
    status: "available"
  },
  {
    id: "task-002",
    title: "Prepare a follow-up task for the same project",
    projectId: "demo-project",
    status: "available"
  },
  {
    id: "task-003",
    title: "Unrelated task for another project",
    projectId: "other-project",
    status: "available"
  }
];

export function createInMemoryTaskStore({
  logger,
  initialTasks = defaultTasks
}: CreateInMemoryTaskStoreParams): TaskStore {
  const tasks = initialTasks.map((task) => ({ ...task }));

  return {
    async claimNextTask(projectId: string, agentName: string): Promise<TaskRecord | null> {
      logger.step(
        "storage:in-memory-task-store",
        `In-memory task store looks for the next available task in project "${projectId}".`
      );

      const task = tasks.find(
        (candidate) => candidate.projectId === projectId && candidate.status === "available"
      );

      if (!task) {
        logger.step(
          "storage:in-memory-task-store",
          `In-memory task store found no available task for project "${projectId}".`
        );

        return null;
      }

      task.status = "assigned";
      task.assignedTo = agentName;

      logger.step(
        "storage:in-memory-task-store",
        `In-memory task store claimed task "${task.id}" for agent "${agentName}".`
      );

      return { ...task };
    }
  };
}
