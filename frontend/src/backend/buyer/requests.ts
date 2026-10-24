import { contracts } from "../../contracts/index.ts";
import type {
  Contract,
  RequestVersion,
  SellerBrief,
} from "../../contracts/index.ts";

// S provides these profile checks. They must validate types, units, operators,
// compatibility and contradictions using the pinned profile version.
export interface RequirementValidator {
  validate(lines: Contract<"RequestLine">[]): void;
}

export function validateConfirmation(
  input: unknown,
  now: number,
  rules: RequirementValidator,
) {
  const command = contracts.ConfirmRequestInput.parse(input);
  if (command.deliveryDeadline <= now)
    throw new Error("INVALID_INPUT: deadline must be in the future");
  if (!command.shareTarget && command.sharedTargetCents !== null) {
    throw new Error("INVALID_INPUT: target requires separate consent");
  }
  if (
    command.shareTarget &&
    (command.sharedTargetCents === null ||
      command.sharedTargetCents > command.privateMaximumCents)
  ) {
    throw new Error(
      "INVALID_INPUT: shared target must be within the private maximum",
    );
  }
  const primary = command.lines.filter((line) => line.role === "primary");
  if (
    primary.length !== 1 ||
    new Set(command.lines.map((line) => line.lineId)).size !==
      command.lines.length
  ) {
    throw new Error(
      "INVALID_INPUT: exactly one primary and unique line IDs required",
    );
  }
  const requirementIds = command.lines.flatMap((line) =>
    line.requirements.map((requirement) => requirement.id),
  );
  if (new Set(requirementIds).size !== requirementIds.length)
    throw new Error("INVALID_INPUT: duplicate requirement IDs");
  rules.validate(command.lines);
  return command;
}

// Construct every public field explicitly. Never spread a private request or
// copy free text: approved summaries still require sanitization at confirmation.
export function buildSellerBrief(
  input: RequestVersion,
  runId: string,
): SellerBrief {
  const request = contracts.RequestVersion.parse(input);
  if (
    request.request.id !== request.brief.request.id ||
    request.request.version !== request.brief.request.version
  ) {
    throw new Error("STALE_VERSION: brief does not belong to request");
  }
  return contracts.SellerBrief.parse({
    schemaVersion: 1,
    request: request.brief.request,
    currency: request.brief.currency,
    deliveryRegion: request.brief.deliveryRegion,
    deliveryDeadline: request.brief.deliveryDeadline,
    // This field was previously copied verbatim: a confirmed summary could
    // still contain "my private maximum is $1,000" or personal context. Until
    // reviewed, profile-backed use-case templates exist, project a neutral
    // summary from typed fields only. Hard/soft requirements remain explicit.
    lines: request.brief.lines.map((line) => ({
      ...line,
      useCaseSummary: `Request for ${line.quantity} ${line.category.replaceAll("_", " ")} item${line.quantity === 1 ? "" : "s"}.`,
    })),
    sharedTarget: request.brief.sharedTarget,
    runId,
  });
}
