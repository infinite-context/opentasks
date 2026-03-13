import type { OperationResultDto } from "@opentasks/contracts";

export interface SessionService {
  startSession(workingDirectory: string): Promise<OperationResultDto>;
}
