import type { ModelRequest, ModelResponse } from "../../shared/types";

export interface ExternalModelProvider {
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
