import type { DashboardSnapshotDto } from "@opentasks/contracts";
import type { MetricTrend } from "../types";
import { renderMetricCard } from "./MetricCard";

export function renderMetricGrid(snapshot: DashboardSnapshotDto | null): string {
  if (!snapshot) {
    return `
      ${renderMetricCard("Total tasks", "--", "Loading", "neutral")}
      ${renderMetricCard("In progress", "--", "Loading", "up")}
      ${renderMetricCard("Blocked", "--", "Loading", "neutral")}
      ${renderMetricCard("Active agents", "--", "Loading", "up")}
      ${renderMetricCard("Learned artifacts", "--", "Loading", "neutral")}
    `;
  }

  const blockedTrend: MetricTrend =
    snapshot.summary.blockedTasks > 0 ? "down" : "neutral";

  const artifactCount =
    snapshot.learning != null ? String(snapshot.learning.artifactCount) : "—";
  const artifactHint =
    snapshot.learning != null
      ? `${snapshot.learning.recentArtifacts.length} previewed below`
      : "Select a project with dashboard data";

  return `
    ${renderMetricCard("Total tasks", String(snapshot.summary.totalTasks), `${snapshot.summary.availableTasks} available now`, "neutral")}
    ${renderMetricCard("In progress", String(snapshot.summary.inProgressTasks), `${snapshot.summary.assignedTasks} assigned next`, "up")}
    ${renderMetricCard("Blocked", String(snapshot.summary.blockedTasks), `${snapshot.summary.failedTasks} failed`, blockedTrend)}
    ${renderMetricCard("Active agents", String(snapshot.summary.activeAgents), `${snapshot.agents.length} reporting`, "up")}
    ${renderMetricCard("Learned artifacts", artifactCount, artifactHint, "neutral")}
  `;
}
