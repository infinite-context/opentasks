import type { ModelRequest, ModelResponse } from "../../shared/dtos";

export interface ExternalModelProvider {
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
