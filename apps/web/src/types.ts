export type Theme = "light" | "dark";

export type TaskFilter = "all" | "blocked" | "in_progress";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export type ViewId =
  | "dashboard"
  | "tasks"
  | "agents"
  | "analytics"
  | "system-health"
  | "mcp"
  | "runs"
  | "memory"
  | "settings";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
}

export type MetricTrend = "up" | "down" | "neutral";

export type AnalyticsTimeRange = "day" | "week" | "month" | "year";
