import type { ModelRequest, ModelResponse } from "@opentasks/contracts";

export interface ExternalModelProvider {
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
