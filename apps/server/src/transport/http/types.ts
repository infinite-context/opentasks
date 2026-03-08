export interface HttpTransport {
  start(): Promise<void>;
  close(): Promise<void>;
}
