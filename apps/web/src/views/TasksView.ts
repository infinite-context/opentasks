import type { TaskEvent, TaskRecord } from "@opentasks/contracts";
import type { TaskFilter } from "../types";
import {
  renderTaskDetailCard,
  renderTaskListSection
} from "../components";

export interface TasksViewProps {
  tasks: TaskRecord[];
  activeFilter: TaskFilter;
  selectedTaskId: string;
  taskDetailEvents: TaskEvent[] | null;
  errorMessage: string;
  isLoading: boolean;
}

export function renderTasksView(props: TasksViewProps): string {
  const {
    tasks,
    activeFilter,
    selectedTaskId,
    taskDetailEvents,
    errorMessage,
    isLoading
  } = props;

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  return `
    <section class="content-grid">
      <div class="stack">
        ${renderTaskListSection(tasks, activeFilter, selectedTaskId, errorMessage, isLoading)}
      </div>

      <div class="stack">
        ${renderTaskDetailCard(selectedTask, taskDetailEvents ?? undefined)}
      </div>
    </section>
  `;
}
