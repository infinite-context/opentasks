import type { TaskEvent, TaskRecord } from "@opentasks/contracts";
import { escapeHtml, formatRelativeTime, formatStatus, formatTaskEvent } from "../utils";

export function renderTaskDetailCard(
  selectedTask: TaskRecord | null,
  taskEvents?: TaskEvent[]
): string {
  const showActivity = selectedTask && taskEvents !== undefined;

  return `
    <section class="card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Selected task</div>
          ${selectedTask ? `<div class="task-detail__id">${escapeHtml(selectedTask.id)}</div>` : ""}
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
                <div class="detail-value">${
                  selectedTask.assignedTo
                    ? `<span class="agent-link" data-agent-link data-agent-name="${escapeHtml(selectedTask.assignedTo)}" role="button" tabindex="0">${escapeHtml(selectedTask.assignedTo)}</span>`
                    : escapeHtml("Unassigned")
                }</div>
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

            ${
              showActivity
                ? `
                  <div class="task-detail__activity">
                    <div class="card__header">
                      <div>
                        <div class="eyebrow">Live signal</div>
                        <h3>Recent activity</h3>
                      </div>
                    </div>
                    <div class="activity-list">
                      ${
                        taskEvents!.length > 0
                          ? taskEvents!.map((event) => renderTaskEventItem(event)).join("")
                          : `<div class="detail-callout"><div class="detail-value">No activity yet for this task.</div></div>`
                      }
                    </div>
                  </div>
                `
                : ""
            }
          `
          : `<div class="detail-summary">Select a task to inspect its current backend state.</div>`
      }
    </section>
  `;
}

function renderTaskEventItem(event: TaskEvent): string {
  return `
    <div class="activity-item">
      <div class="activity-item__time">${escapeHtml(formatRelativeTime(event.createdAt))}</div>
      <div>
        <div class="activity-item__title">${escapeHtml(formatTaskEvent(event))}</div>
      </div>
    </div>
  `;
}
