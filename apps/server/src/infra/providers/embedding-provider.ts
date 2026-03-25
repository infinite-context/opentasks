export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  validate?(): Promise<void>;
  embed(text: string): Promise<number[]>;
}
