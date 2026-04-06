import type { ClientRuntimeCapability, OperationResultDto } from "@opentasks/contracts";

export interface SessionService {
  startSession(
    workingDirectory: string,
    clientCapability?: ClientRuntimeCapability
  ): Promise<OperationResultDto>;
}
