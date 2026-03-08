import type { TaskEvent, TaskStatus } from "@opentasks/contracts";

export function formatStatus(status: TaskStatus): string {
  return status.replaceAll("_", " ");
}

export function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) {
    return "Unknown";
  }

  const diffMs = Date.now() - new Date(timestamp).getTime();
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
