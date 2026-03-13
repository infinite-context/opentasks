import type { AgentRecordDto } from "@opentasks/contracts";
import { escapeHtml, formatDateTime } from "../utils";

export function renderAgentListSection(
  agents: AgentRecordDto[],
  selectedAgentName: string,
  isLoading: boolean,
  errorMessage: string
): string {
  return `
    <section class="card card--large">
      <div class="card__header">
        <div>
          <div class="eyebrow">Connected</div>
          <h2>Agents</h2>
        </div>
      </div>

      ${
        errorMessage
          ? `<div class="detail-callout"><div class="detail-value">${escapeHtml(errorMessage)}</div></div>`
          : ""
      }

      <div class="agent-list" role="list">
        ${
          isLoading
            ? `<div class="detail-callout"><div class="detail-value">Loading agents...</div></div>`
            : agents.length > 0
              ? agents.map((agent) => renderAgentRow(agent, agent.displayName === selectedAgentName)).join("")
              : `<div class="detail-callout"><div class="detail-value">No agents have connected yet.</div></div>`
        }
      </div>
    </section>
  `;
}

function renderAgentRow(agent: AgentRecordDto, isSelected: boolean): string {
  const clientInfo = agent.clientName
    ? `${escapeHtml(agent.clientName)}${agent.clientVersion ? ` ${escapeHtml(agent.clientVersion)}` : ""}`
    : null;
  return `
    <div class="agent-row ${isSelected ? "agent-row--selected" : ""}" data-agent-name="${escapeHtml(agent.displayName)}" role="listitem" tabindex="0">
      <div class="agent-row__header">
        <span class="agent-row__name">${escapeHtml(agent.displayName)}</span>
      </div>
      <div class="agent-row__stats">
        ${clientInfo ? escapeHtml(clientInfo) : "—"}
      </div>
      <div class="agent-row__meta">Last seen ${escapeHtml(formatDateTime(agent.lastSeenAt))}</div>
    </div>
  `;
}
