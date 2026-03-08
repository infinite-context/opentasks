import type { TaskEvent, TaskRecord } from "@opentasks/contracts";
import { escapeHtml, formatStatus, formatTaskEvent, formatTaskEventDetail } from "../utils";

export function renderTaskDetailCard(
  selectedTask: TaskRecord | null,
  selectedEvents: TaskEvent[]
): string {
  return `
    <section class="card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Selected task</div>
          <h2>${escapeHtml(selectedTask?.title ?? "No task selected")}</h2>
        </div>
        ${
          selectedTask
            ? `<span class="status-pill status-pill--${selectedTask.status}">${escapeHtml(formatStatus(selectedTask.status))}</span>`
            : ""
        }
      </div>

      ${
        selectedTask
          ? `
            <div class="detail-grid">
              <div>
                <div class="detail-label">Task ID</div>
                <div class="detail-value">${escapeHtml(selectedTask.id)}</div>
              </div>
              <div>
                <div class="detail-label">Priority</div>
                <div class="detail-value">${escapeHtml(selectedTask.priority)}</div>
              </div>
              <div>
                <div class="detail-label">Assigned</div>
                <div class="detail-value">${escapeHtml(selectedTask.assignedTo ?? "Unassigned")}</div>
              </div>
              <div>
                <div class="detail-label">Source</div>
                <div class="detail-value">${escapeHtml(selectedTask.source)}</div>
              </div>
            </div>

            <p class="detail-summary">${escapeHtml(selectedTask.description || "No description provided for this task.")}</p>

            <div class="detail-callout">
              <div class="detail-label">Blocker</div>
              <div class="detail-value">${escapeHtml(selectedTask.blockedReason ?? selectedTask.lastError ?? "No active blocker")}</div>
            </div>

            <div class="timeline">
              ${
                selectedEvents.length > 0
                  ? selectedEvents
                      .map(
                        (event, index) => `
                          <div class="timeline__item">
                            <div class="timeline__marker">${index + 1}</div>
                            <div>
                              <div class="mini-table__title">${escapeHtml(formatTaskEvent(event))}</div>
                              <div class="activity-item__detail">${escapeHtml(formatTaskEventDetail(event))}</div>
                            </div>
                          </div>
                        `
                      )
                      .join("")
                  : `<div class="detail-summary">No lifecycle events have been recorded for this task yet.</div>`
              }
            </div>
          `
          : `<div class="detail-summary">Select a task to inspect its current backend state.</div>`
      }
    </section>
  `;
}
