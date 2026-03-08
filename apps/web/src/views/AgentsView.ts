import type { DashboardSnapshotDto } from "@opentasks/contracts";
import { renderAgentDetailCard, renderAgentListSection } from "../components";

export interface AgentsViewProps {
  snapshot: DashboardSnapshotDto | null;
  selectedAgentName: string;
}

export function renderAgentsView(props: AgentsViewProps): string {
  const { snapshot, selectedAgentName } = props;
  const agents = snapshot?.agents ?? [];
  const tasks = snapshot?.tasks ?? [];

  return `
    <section class="content-grid">
      <div class="stack">
        ${renderAgentListSection(agents, selectedAgentName)}
      </div>

      <div class="stack">
        ${renderAgentDetailCard(selectedAgentName || null, tasks)}
      </div>
    </section>
  `;
}
