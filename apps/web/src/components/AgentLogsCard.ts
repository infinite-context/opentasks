import type { McpLogRecordDto } from "@opentasks/contracts";
import { escapeHtml, formatDateTime } from "../utils";

export function renderAgentLogsCard(
  agentName: string | null,
  logs: McpLogRecordDto[],
  isLoading: boolean,
  errorMessage: string
): string {
  if (!agentName) {
    return `
      <section class="card">
        <div class="card__header">
          <div>
            <div class="eyebrow">Agent Activity</div>
            <h2>No agent selected</h2>
          </div>
        </div>
        <div class="detail-summary">Select an agent to view their MCP call logs.</div>
      </section>
    `;
  }

  return `
    <section class="card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Agent Activity</div>
          <h2>${escapeHtml(agentName)}</h2>
        </div>
      </div>

      ${
        errorMessage
          ? `<div class="detail-callout"><div class="detail-value">${escapeHtml(errorMessage)}</div></div>`
          : ""
      }

      <div class="agent-logs-list">
        ${
          isLoading
            ? `<div class="detail-callout"><div class="detail-value">Loading logs...</div></div>`
            : logs.length > 0
              ? `
                <div class="agent-logs" role="list">
                  ${logs.map((log) => renderLogRow(log)).join("")}
                </div>
              `
              : `<div class="detail-callout"><div class="detail-value">No MCP calls from this agent yet.</div></div>`
        }
      </div>
    </section>
  `;
}

function renderLogRow(log: McpLogRecordDto): string {
  const paramsHtml = `
    <details class="agent-log-row__params-details">
      <summary class="agent-log-row__params-summary">Parameters</summary>
      <pre class="agent-log-row__params-json">${escapeHtml(log.argsJson)}</pre>
    </details>
  `;

  const hasResult = Boolean(log.resultJson);
  const resultHtml = hasResult
    ? `
      <details class="agent-log-row__result-details">
        <summary class="agent-log-row__result-summary">Response</summary>
        <pre class="agent-log-row__result-json">${escapeHtml(log.resultJson ?? "")}</pre>
      </details>
    `
    : "";

  return `
    <div class="agent-log-row agent-log-row--${log.resultStatus}" role="listitem">
      <div class="agent-log-row__header">
        <span class="agent-log-row__tool">${escapeHtml(log.toolName)}</span>
        <span class="status-pill status-pill--compact status-pill--${log.resultStatus}">${escapeHtml(log.resultStatus)}</span>
      </div>
      ${paramsHtml}
      ${
        log.errorMessage
          ? `<div class="agent-log-row__error">${escapeHtml(log.errorMessage)}</div>`
          : ""
      }
      ${resultHtml}
      <div class="agent-log-row__meta">${escapeHtml(formatDateTime(log.createdAt))}</div>
    </div>
  `;
}
