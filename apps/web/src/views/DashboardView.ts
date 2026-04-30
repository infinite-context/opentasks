import type { ConnectionState } from "../types";
import type { DashboardSnapshotDto } from "@opentasks/contracts";
import {
  renderActivityCard,
  renderAgentUtilizationCard,
  renderHealthCard,
  renderLearningMemoryCard,
  renderMetricGrid,
  renderPipelineSection,
  renderTaskDetailCard,
  renderTaskListSection
} from "../components";
import type { TaskRecord } from "@opentasks/contracts";
import type { TaskFilter } from "../types";

export interface DashboardViewProps {
  snapshot: DashboardSnapshotDto | null;
  filteredTasks: TaskRecord[];
  activeTaskFilter: TaskFilter;
  selectedTask: TaskRecord | null;
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
    connectionState,
    errorMessage,
    isLoading
  } = props;

  return `
    <section class="metric-grid">
      ${renderMetricGrid(snapshot)}
    </section>

    <div class="dashboard-memory-slot">
      ${renderLearningMemoryCard(snapshot)}
    </div>

    <section class="content-grid">
      <div class="stack">
        ${renderPipelineSection(snapshot?.pipeline ?? [], connectionState)}
        ${renderTaskListSection(filteredTasks, activeTaskFilter, selectedTask?.id ?? "", errorMessage, isLoading)}
      </div>

      <div class="stack">
        ${renderTaskDetailCard(selectedTask)}
        ${renderActivityCard(snapshot?.activity ?? [])}
        ${renderAgentUtilizationCard(snapshot?.agents ?? [])}
        ${renderHealthCard(snapshot?.health ?? [])}
      </div>
    </section>
  `;
}
