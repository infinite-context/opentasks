export interface McpTransport {
  start(): Promise<void>;
  close(): Promise<void>;
}
