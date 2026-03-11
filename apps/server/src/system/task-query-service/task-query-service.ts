import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type {
  TaskListQuery,
  TaskRecord,
  TaskSearchMatchedField,
  TaskSearchQuery
} from "@opentasks/contracts";
import type { TaskQueryService } from "./types";

interface CreateTaskQueryServiceParams {
  logger: Logger;
  taskStore: TaskStore;
}

export function createTaskQueryService({
  logger,
  taskStore
}: CreateTaskQueryServiceParams): TaskQueryService {
  return {
    async getTaskDetail(taskId) {
      logger.step("task-query-service", `Loading task detail for "${taskId}".`);
      const [task, events] = await Promise.all([
        taskStore.getTaskById(taskId),
        taskStore.listTaskEvents(taskId)
      ]);

      return {
        task,
        events
      };
    },
    async listTasks(query?: TaskListQuery) {
      logger.step("task-query-service", "Listing tasks for query consumers.");
      const tasks = await taskStore.listTasks(query);
      return { tasks };
    },
    async searchTasks(query: TaskSearchQuery) {
      logger.step("task-query-service", `Searching tasks for query consumers using "${query.query}".`);

      const candidateTasks = await taskStore.listTasks({
        projectId: query.projectId,
        goalId: query.goalId,
        status: query.status,
        assignedTo: query.assignedTo
      });

      const normalizedQuery = normalizeText(query.query);
      const queryTokens = tokenizeQuery(normalizedQuery);

      const results = candidateTasks
        .map((task) => scoreTask(task, normalizedQuery, queryTokens))
        .filter((result) => result.score > 0)
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return right.task.updatedAt.localeCompare(left.task.updatedAt);
        })
        .slice(0, query.limit ?? candidateTasks.length);

      return {
        query: query.query,
        results
      };
    }
  };
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function tokenizeQuery(query: string): string[] {
  return [...new Set(query.split(/\s+/).filter((token) => token.length > 0))];
}

function scoreTask(
  task: TaskRecord,
  normalizedQuery: string,
  queryTokens: string[]
): {
  task: TaskRecord;
  score: number;
  matchedFields: TaskSearchMatchedField[];
} {
  const title = normalizeText(task.title);
  const description = normalizeText(task.description);
  let score = 0;
  const matchedFields = new Set<TaskSearchMatchedField>();

  if (normalizedQuery.length > 0 && title.includes(normalizedQuery)) {
    score += 4;
    matchedFields.add("title");
  }

  if (normalizedQuery.length > 0 && description.includes(normalizedQuery)) {
    score += 2;
    matchedFields.add("description");
  }

  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 1;
      matchedFields.add("title");
    }

    if (description.includes(token)) {
      score += 0.5;
      matchedFields.add("description");
    }
  }

  return {
    task,
    score,
    matchedFields: [...matchedFields]
  };
}
