import type { ModelRequest, ModelResponse } from "../../shared/types";

export interface ModelProviderService {
  sendModelRequest(request: ModelRequest): Promise<ModelResponse>;
}
