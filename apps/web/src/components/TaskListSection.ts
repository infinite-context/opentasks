import type { TaskRecord } from "@opentasks/contracts";
import type { TaskFilter } from "../types";
import { escapeHtml, formatRelativeTime, formatStatus } from "../utils";

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

function renderTaskRow(task: TaskRecord, isSelected: boolean): string {
  return `
    <button class="task-row ${isSelected ? "task-row--selected" : ""}" data-task-id="${escapeHtml(task.id)}" type="button" role="listitem">
      <div class="task-row__main">
        <div class="task-row__title">${escapeHtml(task.title)}</div>
        <div class="task-row__meta">
          ${escapeHtml(task.id)} | ${escapeHtml(task.assignedTo ?? "Unassigned")} | Updated ${escapeHtml(formatRelativeTime(task.updatedAt))}
        </div>
      </div>
      <div class="task-row__stats">
        <span class="status-pill status-pill--${task.status}">${escapeHtml(formatStatus(task.status))}</span>
        <span class="task-row__score">${escapeHtml(task.priority)}</span>
        <span class="task-row__age">${escapeHtml(formatRelativeTime(task.createdAt))}</span>
      </div>
    </button>
  `;
}
