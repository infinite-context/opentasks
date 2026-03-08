import type { ModelRequest, ModelResponse } from "@opentasks/contracts";

export interface ModelProviderService {
  sendModelRequest(request: ModelRequest): Promise<ModelResponse>;
}
