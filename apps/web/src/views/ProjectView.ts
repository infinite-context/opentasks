import type { GoalRecord, ProjectRecord, TaskRecord } from "@opentasks/contracts";
import { renderTaskRow } from "../components";
import { escapeHtml } from "../utils";

export interface ProjectViewProps {
  project: ProjectRecord | null;
  goals: GoalRecord[];
  tasks: TaskRecord[];
  selectedTaskId: string;
  errorMessage: string;
  isLoading: boolean;
}

export function renderProjectView(props: ProjectViewProps): string {
  const { project, goals, tasks, selectedTaskId, errorMessage, isLoading } = props;

  const totalTasks = tasks.length;
  const goalsWithTasks = goals.map((goal) => ({
    goal,
    goalTasks: tasks.filter((t) => t.goalId === goal.id)
  }));

  return `
    <section class="project-view">
      <section class="card card--large project-view__header">
        <div class="card__header">
          <div>
            <div class="eyebrow">Current project</div>
            <h2>${project ? escapeHtml(project.name) : "Loading…"}</h2>
            ${project ? `<div class="project-view__key">${escapeHtml(project.key)}</div>` : ""}
          </div>
        </div>

        ${
          errorMessage
            ? `<div class="form-callout form-callout--error">${escapeHtml(errorMessage)}</div>`
            : ""
        }

        ${
          !errorMessage && project
            ? `
              <div class="project-view__summary">
                <div class="project-view__stat">
                  <span class="project-view__stat-value">${goals.length}</span>
                  <span class="project-view__stat-label">Goals</span>
                </div>
                <div class="project-view__stat">
                  <span class="project-view__stat-value">${totalTasks}</span>
                  <span class="project-view__stat-label">Tasks</span>
                </div>
              </div>
            `
            : ""
        }
      </section>

      ${
        isLoading
          ? `<p class="detail-summary">Loading project structure…</p>`
          : goals.length === 0
            ? `<p class="detail-summary">No goals have been defined for this project yet.</p>`
            : `
              <div class="project-view__tree">
                ${goalsWithTasks
                  .map(
                    ({ goal, goalTasks }) => `
                      <details class="project-view__goal" open>
                        <summary class="project-view__goal-summary">
                          <span class="project-view__goal-name">${escapeHtml(goal.name)}</span>
                          <span class="status-pill status-pill--health-${goal.status === "active" ? "healthy" : goal.status === "paused" ? "degraded" : "warning"}">
                            ${escapeHtml(goal.status)}
                          </span>
                          <span class="project-view__goal-meta">${goalTasks.length} task(s)</span>
                        </summary>
                        <div class="project-view__goal-id">${escapeHtml(goal.id)} in <span class="project-link" data-project-link data-project-id="${escapeHtml(goal.projectId)}" role="button" tabindex="0">${escapeHtml(goal.projectId)}</span></div>
                        ${goal.description ? `<p class="project-view__goal-desc">${escapeHtml(goal.description)}</p>` : ""}
                        <div class="project-view__goal-tasks task-list">
                          ${
                            goalTasks.length > 0
                              ? goalTasks
                                  .map((task) => renderTaskRow(task, task.id === selectedTaskId))
                                  .join("")
                              : `<p class="detail-summary">No tasks in this goal.</p>`
                          }
                        </div>
                      </details>
                    `
                  )
                  .join("")}
              </div>
            `
      }
    </section>
  `;
}
