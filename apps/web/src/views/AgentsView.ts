import type { AgentRecordDto, McpLogRecordDto, TaskRecord } from "@opentasks/contracts";
import { renderAgentDetailCard, renderAgentListSection, renderAgentLogsCard } from "../components";

export interface AgentsViewProps {
  agents: AgentRecordDto[];
  tasks: TaskRecord[];
  selectedAgentName: string;
  agentLogs: McpLogRecordDto[];
  isLoading: boolean;
  errorMessage: string;
  agentLogsLoading: boolean;
  agentLogsErrorMessage: string;
}

export function renderAgentsView(props: AgentsViewProps): string {
  const {
    agents,
    tasks,
    selectedAgentName,
    agentLogs,
    isLoading,
    errorMessage,
    agentLogsLoading,
    agentLogsErrorMessage
  } = props;

  return `
    <section class="content-grid">
      <div class="stack">
        ${renderAgentListSection(agents, selectedAgentName, isLoading, errorMessage)}
      </div>

      <div class="stack">
        ${renderAgentDetailCard(selectedAgentName || null, tasks)}
        ${renderAgentLogsCard(selectedAgentName || null, agentLogs, agentLogsLoading, agentLogsErrorMessage)}
      </div>
    </section>
  `;
}
