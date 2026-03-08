import type { TaskRecord } from "@opentasks/contracts";
import type { TaskFilter } from "../types";
import { escapeHtml, formatDateTime, formatStatus } from "../utils";

export function renderTaskListSection(
  tasks: TaskRecord[],
  activeFilter: TaskFilter,
  selectedTaskId: string,
  errorMessage: string,
  isLoading: boolean
): string {
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return `
    <section class="card card--large">
      <div class="card__header">
        <div>
          <div class="eyebrow">Priority queue</div>
          <h2>Tasks</h2>
        </div>
        <div class="task-filters">
          ${renderFilterChip("all", "All", activeFilter)}
          ${renderFilterChip("blocked", "Blocked", activeFilter)}
          ${renderFilterChip("in_progress", "In progress", activeFilter)}
        </div>
      </div>

      ${
        errorMessage
          ? `<div class="detail-callout"><div class="detail-value">${escapeHtml(errorMessage)}</div></div>`
          : ""
      }

      <div class="task-list" role="list">
        ${
          tasks.length > 0
            ? tasks.map((task) => renderTaskRow(task, task.id === selectedTask?.id)).join("")
            : `<div class="detail-callout"><div class="detail-value">${isLoading ? "Loading tasks..." : "No tasks match the current filter."}</div></div>`
        }
      </div>
    </section>
  `;
}

function renderFilterChip(filter: TaskFilter, label: string, activeFilter: TaskFilter): string {
  return `
    <button class="chip ${activeFilter === filter ? "chip--active" : ""}" data-filter="${filter}" type="button">
      ${escapeHtml(label)}
    </button>
  `;
}

export function renderTaskRow(task: TaskRecord, isSelected: boolean): string {
  return `
    <div class="task-row ${isSelected ? "task-row--selected" : ""}" data-task-id="${escapeHtml(task.id)}" role="listitem" tabindex="0">
      <div class="task-row__header">
        <div class="task-row__id">${escapeHtml(task.id)} in <span class="goal-link" data-goal-link data-goal-id="${escapeHtml(task.goalId)}" role="button" tabindex="0">${escapeHtml(task.goalId)}</span></div>
        <span class="status-pill status-pill--compact status-pill--${task.status}">${escapeHtml(formatStatus(task.status))}</span>
      </div>
      <div class="task-row__title-row">
        <span class="task-row__title">${escapeHtml(task.title)}</span>
        <span class="priority-badge">${escapeHtml(task.priority)}</span>
      </div>
      <div class="task-row__details">
        ${escapeHtml(task.description ? (task.description.length > 120 ? task.description.slice(0, 120) + "…" : task.description) : "No description")}
      </div>
      <div class="task-row__footer">
        <span class="task-row__agent agent-link ${!task.assignedTo ? "task-row__agent--muted" : ""}" data-agent-link data-agent-name="${escapeHtml(task.assignedTo ?? "")}" role="button" tabindex="${task.assignedTo ? "0" : "-1"}">
          ${escapeHtml(task.assignedTo ?? "Unassigned")}
        </span>
        <span class="task-row__meta">Updated ${escapeHtml(formatDateTime(task.updatedAt))}</span>
      </div>
    </div>
  `;
}
