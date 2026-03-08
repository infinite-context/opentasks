import type { TaskRecord } from "@opentasks/contracts";
import type { TaskFilter } from "../types";
import {
  renderTaskDetailCard,
  renderTaskListSection
} from "../components";
import type { TaskDetailDto } from "@opentasks/contracts";

export interface TasksViewProps {
  tasks: TaskRecord[];
  activeFilter: TaskFilter;
  selectedTaskId: string;
  selectedTaskDetail: TaskDetailDto | null;
  errorMessage: string;
  isLoading: boolean;
}

export function renderTasksView(props: TasksViewProps): string {
  const {
    tasks,
    activeFilter,
    selectedTaskId,
    selectedTaskDetail,
    errorMessage,
    isLoading
  } = props;

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedEvents =
    selectedTaskDetail && selectedTask && selectedTaskDetail.task?.id === selectedTask.id
      ? selectedTaskDetail.events
      : [];

  return `
    <section class="content-grid">
      <div class="stack">
        ${renderTaskListSection(tasks, activeFilter, selectedTaskId, errorMessage, isLoading)}
      </div>

      <div class="stack">
        ${renderTaskDetailCard(selectedTask, selectedEvents)}
      </div>
    </section>
  `;
}
