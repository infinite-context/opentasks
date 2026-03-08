import type { DashboardSnapshotDto } from "@opentasks/contracts";
import { renderAgentUtilizationCard } from "../components";

export function renderAgentsView(snapshot: DashboardSnapshotDto | null): string {
  const agents = snapshot?.agents ?? [];

  return `
    <section class="content-grid">
      <div class="stack">
        ${renderAgentUtilizationCard(agents)}
      </div>
    </section>
  `;
}
