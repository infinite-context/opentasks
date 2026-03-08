import type { TaskEvent, TaskStatus } from "@opentasks/contracts";

export function formatStatus(status: TaskStatus): string {
  return status.replaceAll("_", " ");
}

/** Normalize SQLite "YYYY-MM-DD HH:MM:SS" (UTC) to ISO format for reliable parsing. */
export function parseTimestamp(timestamp: string): Date {
  const normalized = timestamp.includes(" ") && !timestamp.includes("T")
    ? timestamp.replace(" ", "T") + (timestamp.length === 19 ? "Z" : "")
    : timestamp;
  return new Date(normalized);
}

export function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) {
    return "Unknown";
  }

  const date = parseTimestamp(timestamp);
  const timeMs = date.getTime();
  if (!Number.isFinite(timeMs)) {
    return "Unknown";
  }

  const diffMs = Date.now() - timeMs;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatDateTime(timestamp: string | null): string {
  if (!timestamp) {
    return "Unknown";
  }

  const date = parseTimestamp(timestamp);
  const timeMs = date.getTime();
  if (!Number.isFinite(timeMs)) {
    return "Unknown";
  }

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  if (isToday) {
    return timeStr;
  }

  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined
  });

  return `${dateStr}, ${timeStr}`;
}

export function formatTaskEvent(event: TaskEvent): string {
  const action = event.eventType.replace("task_", "").replaceAll("_", " ");
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
}

export function formatTaskEventDetail(event: TaskEvent): string {
  if (event.actorId) {
    return `${event.actorType} ${event.actorId} at ${formatRelativeTime(event.createdAt)}`;
  }

  return `${event.actorType} event at ${formatRelativeTime(event.createdAt)}`;
}

export function formatHealthState(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}
