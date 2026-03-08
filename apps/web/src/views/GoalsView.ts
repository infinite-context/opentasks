import type { GoalRecord, TaskRecord } from "@opentasks/contracts";
import { renderTaskRow } from "../components";
import { escapeHtml } from "../utils";

export interface GoalsViewProps {
  goals: GoalRecord[];
  tasks: TaskRecord[];
  selectedGoalId: string;
  selectedTaskId: string;
  errorMessage: string;
  isLoading: boolean;
}

export function renderGoalsView(props: GoalsViewProps): string {
  const { goals, tasks, selectedGoalId, selectedTaskId, errorMessage, isLoading } = props;
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? goals[0] ?? null;
  const selectedGoalTasks = selectedGoal
    ? tasks.filter((task) => task.goalId === selectedGoal.id)
    : [];

  return `
    <section class="content-grid">
      <div class="stack">
        <section class="card card--large">
          <div class="card__header">
            <div>
              <div class="eyebrow">Project goals</div>
              <h2>Goals</h2>
            </div>
          </div>

          ${
            errorMessage
              ? `<div class="form-callout form-callout--error">${escapeHtml(errorMessage)}</div>`
              : ""
          }

          ${
            isLoading
              ? `<p class="detail-summary">Loading goals for the active project...</p>`
              : goals.length === 0
                ? `<p class="detail-summary">No goals have been defined for this project yet.</p>`
                : `
                  <div class="goal-list">
                    ${goals
                      .map((goal) => {
                        const goalTaskCount = tasks.filter((task) => task.goalId === goal.id).length;
                        const activeTaskCount = tasks.filter(
                          (task) => task.goalId === goal.id && (task.status === "assigned" || task.status === "in_progress")
                        ).length;

                        return `
                          <button
                            class="goal-row ${goal.id === (selectedGoal?.id ?? "") ? "goal-row--selected" : ""}"
                            data-goal-id="${escapeHtml(goal.id)}"
                            type="button"
                          >
                            <div class="goal-row__id">${escapeHtml(goal.id)} in <span class="project-link" data-project-link data-project-id="${escapeHtml(goal.projectId)}" role="button" tabindex="0">${escapeHtml(goal.projectId)}</span></div>
                            <div class="goal-row__header">
                              <span class="goal-row__title">${escapeHtml(goal.name)}</span>
                              <span class="status-pill status-pill--health-${goal.status === "active" ? "healthy" : goal.status === "paused" ? "degraded" : "warning"}">
                                ${escapeHtml(goal.status)}
                              </span>
                            </div>
                            <div class="goal-row__details">${escapeHtml(goal.description || "No description provided.")}</div>
                            <div class="goal-row__footer">
                              <span>${goalTaskCount} task(s)</span>
                              <span>${activeTaskCount} active</span>
                            </div>
                          </button>
                        `;
                      })
                      .join("")}
                  </div>
                `
          }
        </section>
      </div>

      <div class="stack">
        <section class="card card--large">
          <div class="card__header">
            <div>
              <div class="eyebrow">Goal detail</div>
              ${selectedGoal ? `<div class="goal-detail__id">${escapeHtml(selectedGoal.id)} in <span class="project-link" data-project-link data-project-id="${escapeHtml(selectedGoal.projectId)}" role="button" tabindex="0">${escapeHtml(selectedGoal.projectId)}</span></div>` : ""}
              <h2>${escapeHtml(selectedGoal?.name ?? "Select a goal")}</h2>
            </div>
          </div>

          ${
            selectedGoal
              ? `
                <div class="detail-grid">
                  <div>
                    <div class="detail-label">Key</div>
                    <div class="detail-value">${escapeHtml(selectedGoal.key)}</div>
                  </div>
                  <div>
                    <div class="detail-label">Priority</div>
                    <div class="detail-value">${escapeHtml(selectedGoal.priority)}</div>
                  </div>
                  <div>
                    <div class="detail-label">Status</div>
                    <div class="detail-value">${escapeHtml(selectedGoal.status)}</div>
                  </div>
                  <div>
                    <div class="detail-label">Tasks</div>
                    <div class="detail-value">${selectedGoalTasks.length}</div>
                  </div>
                </div>
                <div class="detail-callout">
                  ${escapeHtml(selectedGoal.description || "No description provided.")}
                </div>
                <div class="goal-detail__tasks">
                  <div class="detail-label">Tasks in this goal</div>
                  ${
                    selectedGoalTasks.length > 0
                      ? `
                        <div class="goal-detail__task-list task-list">
                          ${selectedGoalTasks
                            .map((task) => renderTaskRow(task, task.id === selectedTaskId))
                            .join("")}
                        </div>
                      `
                      : `<p class="detail-summary">No tasks are currently attached to this goal.</p>`
                  }
                </div>
              `
              : `<p class="detail-summary">Select a goal to inspect its task coverage and status.</p>`
          }
        </section>
      </div>
    </section>
  `;
}
