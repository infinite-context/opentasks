import type { ModelRequest, ModelResponse } from "../../shared/dtos";

export interface ModelProviderService {
  sendModelRequest(request: ModelRequest): Promise<ModelResponse>;
}
