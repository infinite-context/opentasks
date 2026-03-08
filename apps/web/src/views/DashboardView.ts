import type { ConnectionState } from "../types";
import type { DashboardSnapshotDto } from "@opentasks/contracts";
import {
  renderActivityCard,
  renderAgentUtilizationCard,
  renderHealthCard,
  renderMetricGrid,
  renderPipelineSection,
  renderTaskDetailCard,
  renderTaskListSection
} from "../components";
import type { TaskDetailDto, TaskRecord } from "@opentasks/contracts";
import type { TaskFilter } from "../types";

export interface DashboardViewProps {
  snapshot: DashboardSnapshotDto | null;
  filteredTasks: TaskRecord[];
  activeTaskFilter: TaskFilter;
  selectedTask: TaskRecord | null;
  selectedTaskDetail: TaskDetailDto | null;
  connectionState: ConnectionState;
  errorMessage: string;
  isLoading: boolean;
}

export function renderDashboardView(props: DashboardViewProps): string {
  const {
    snapshot,
    filteredTasks,
    activeTaskFilter,
    selectedTask,
    selectedTaskDetail,
    connectionState,
    errorMessage,
    isLoading
  } = props;

  const selectedEvents =
    selectedTaskDetail && selectedTask && selectedTaskDetail.task?.id === selectedTask.id
      ? selectedTaskDetail.events
      : [];

  return `
    <section class="metric-grid">
      ${renderMetricGrid(snapshot)}
    </section>

    <section class="content-grid">
      <div class="stack">
        ${renderPipelineSection(snapshot?.pipeline ?? [], connectionState)}
        ${renderTaskListSection(filteredTasks, activeTaskFilter, selectedTask?.id ?? "", errorMessage, isLoading)}
      </div>

      <div class="stack">
        ${renderTaskDetailCard(selectedTask, selectedEvents)}
        ${renderActivityCard(snapshot?.activity ?? [])}
        ${renderAgentUtilizationCard(snapshot?.agents ?? [])}
        ${renderHealthCard(snapshot?.health ?? [])}
      </div>
    </section>
  `;
}
