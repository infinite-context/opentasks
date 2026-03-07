export interface TaskRequest {
  agentName: string;
  projectId: string;
  taskHint: string;
}

export type TaskStatus = "available" | "assigned";

export interface TaskRecord {
  id: string;
  title: string;
  projectId: string;
  status: TaskStatus;
  assignedTo?: string;
}

export interface ContextPacket {
  taskId: string;
  relatedMemories: string[];
  notes: string[];
}

export interface HydratedTask extends TaskRecord {
  context: ContextPacket;
}

export interface CompletedRun {
  taskId: string;
  projectId: string;
  summary: string;
  outcome: "success";
}

export interface MemoryArtifact {
  id: string;
  taskId: string;
  summary: string;
  source: "contextual-indexing";
}

export interface ModelRequest {
  prompt: string;
}

export interface ModelResponse {
  provider: string;
  text: string;
}
