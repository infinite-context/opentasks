import type { OperationContextDto, OperationResultDto, OperationStatus } from "@opentasks/contracts";

export function okResult(
  message: string,
  context?: OperationContextDto
): OperationResultDto {
  return {
    status: "ok",
    message,
    guidance: [],
    context
  };
}

export function issueResult(
  status: Exclude<OperationStatus, "ok">,
  message: string,
  guidance: string[] = [],
  context?: OperationContextDto
): OperationResultDto {
  return {
    status,
    message,
    guidance,
    context
  };
}
