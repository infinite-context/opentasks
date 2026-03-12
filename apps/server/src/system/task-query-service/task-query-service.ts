import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type {
  TaskSearchDependencyDto,
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
      const taskCache = new Map(candidateTasks.map((task) => [task.id, task] as const));

      const scoredResults = candidateTasks
        .map((task) => scoreTask(task, normalizedQuery, queryTokens))
        .filter((result) => result.score > 0)
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return right.task.updatedAt.localeCompare(left.task.updatedAt);
        })
        .slice(0, query.limit ?? candidateTasks.length);

      const results = await Promise.all(
        scoredResults.map(async (result) => ({
          ...result,
          ...(await analyzeTaskReadiness(result.task, taskStore, taskCache))
        }))
      );

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

function isTaskAvailableNow(task: TaskRecord): boolean {
  if (task.status !== "available") {
    return false;
  }

  if (!task.availableAt) {
    return true;
  }

  const parsedTimestamp = parseTimestamp(task.availableAt);
  return parsedTimestamp === null ? false : parsedTimestamp <= Date.now();
}

function parseTimestamp(value: string): number | null {
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const sqliteStyle = Date.parse(value.replace(" ", "T") + "Z");
  return Number.isFinite(sqliteStyle) ? sqliteStyle : null;
}

async function analyzeTaskReadiness(
  task: TaskRecord,
  taskStore: TaskStore,
  taskCache: Map<string, TaskRecord>
): Promise<{
  claimable: boolean;
  nextClaimableDependencyTaskIds: string[];
  unresolvedUpstreamDependencies: TaskSearchDependencyDto[];
}> {
  const dependencyInspection = await inspectDependencies(task, taskStore, taskCache, new Set());

  return {
    claimable: isTaskAvailableNow(task) && dependencyInspection.unresolvedDependencies.length === 0,
    nextClaimableDependencyTaskIds: dependencyInspection.nextClaimableDependencyTaskIds,
    unresolvedUpstreamDependencies: dependencyInspection.unresolvedDependencies.map(toTaskDependencyDto)
  };
}

async function inspectDependencies(
  task: TaskRecord,
  taskStore: TaskStore,
  taskCache: Map<string, TaskRecord>,
  ancestry: Set<string>
): Promise<{
  unresolvedDependencies: TaskRecord[];
  nextClaimableDependencyTaskIds: string[];
}> {
  if (ancestry.has(task.id)) {
    return {
      unresolvedDependencies: [],
      nextClaimableDependencyTaskIds: []
    };
  }

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(task.id);
  const unresolvedDependencies: TaskRecord[] = [];
  const nextClaimableDependencyTaskIds: string[] = [];

  for (const dependencyId of task.dependencyIds) {
    const dependency = await getTaskRecordById(dependencyId, taskStore, taskCache);

    if (!dependency || dependency.status === "completed") {
      continue;
    }

    const upstreamDependencies = await inspectDependencies(
      dependency,
      taskStore,
      taskCache,
      nextAncestry
    );

    unresolvedDependencies.push(...upstreamDependencies.unresolvedDependencies, dependency);

    if (upstreamDependencies.unresolvedDependencies.length === 0 && isTaskAvailableNow(dependency)) {
      nextClaimableDependencyTaskIds.push(dependency.id);
    } else {
      nextClaimableDependencyTaskIds.push(...upstreamDependencies.nextClaimableDependencyTaskIds);
    }
  }

  return {
    unresolvedDependencies: dedupeTasks(unresolvedDependencies),
    nextClaimableDependencyTaskIds: dedupeIds(nextClaimableDependencyTaskIds)
  };
}

async function getTaskRecordById(
  taskId: string,
  taskStore: TaskStore,
  taskCache: Map<string, TaskRecord>
): Promise<TaskRecord | null> {
  const cachedTask = taskCache.get(taskId);
  if (cachedTask) {
    return cachedTask;
  }

  const loadedTask = await taskStore.getTaskById(taskId);
  if (loadedTask) {
    taskCache.set(taskId, loadedTask);
  }

  return loadedTask;
}

function dedupeTasks(tasks: TaskRecord[]): TaskRecord[] {
  const seenTaskIds = new Set<string>();

  return tasks.filter((task) => {
    if (seenTaskIds.has(task.id)) {
      return false;
    }

    seenTaskIds.add(task.id);
    return true;
  });
}

function dedupeIds(taskIds: string[]): string[] {
  return [...new Set(taskIds)];
}

function toTaskDependencyDto(task: TaskRecord): TaskSearchDependencyDto {
  return {
    id: task.id,
    title: task.title,
    status: task.status
  };
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
