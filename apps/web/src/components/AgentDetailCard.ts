import type { TaskRecord } from "@opentasks/contracts";
import { escapeHtml, formatDateTime, formatStatus } from "../utils";

export function renderAgentDetailCard(
  agentName: string | null,
  tasks: TaskRecord[]
): string {
  if (!agentName) {
    return `
      <section class="card">
        <div class="card__header">
          <div>
            <div class="eyebrow">Selected agent</div>
            <h2>No agent selected</h2>
          </div>
        </div>
        <div class="detail-summary">Select an agent to view their assigned and completed tasks.</div>
      </section>
    `;
  }

  const assignedTasks = tasks.filter((t) => t.assignedTo === agentName && (t.status === "assigned" || t.status === "in_progress"));
  const completedTasks = tasks.filter((t) => t.assignedTo === agentName && t.status === "completed");
  const failedTasks = tasks.filter((t) => t.assignedTo === agentName && t.status === "failed");

  return `
    <section class="card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Selected agent</div>
          <h2><span class="agent-link" data-agent-link data-agent-name="${escapeHtml(agentName)}" role="button" tabindex="0">${escapeHtml(agentName)}</span></h2>
        </div>
      </div>

      <div class="detail-grid">
        <div>
          <div class="detail-label">Assigned</div>
          <div class="detail-value">${escapeHtml(String(assignedTasks.length))}</div>
        </div>
        <div>
          <div class="detail-label">Completed</div>
          <div class="detail-value">${escapeHtml(String(completedTasks.length))}</div>
        </div>
        <div>
          <div class="detail-label">Failed</div>
          <div class="detail-value">${escapeHtml(String(failedTasks.length))}</div>
        </div>
      </div>

      <div class="agent-detail__tasks">
        <div class="eyebrow">Tasks</div>
        ${
          tasks.filter((t) => t.assignedTo === agentName).length > 0
            ? `
              <div class="agent-task-list">
                ${tasks
                  .filter((t) => t.assignedTo === agentName)
                  .map(
                    (task) => `
                    <div class="agent-task-item">
                      <div class="agent-task-item__header">
                        <span class="agent-task-item__title">${escapeHtml(task.title)}</span>
                        <span class="status-pill status-pill--compact status-pill--${task.status}">${escapeHtml(formatStatus(task.status))}</span>
                      </div>
                      <div class="agent-task-item__meta">${escapeHtml(task.id)} · Updated ${escapeHtml(formatDateTime(task.updatedAt))}</div>
                    </div>
                  `
                  )
                  .join("")}
              </div>
            `
            : `<div class="detail-summary">No tasks assigned to this agent.</div>`
        }
      </div>
    </section>
  `;
}
