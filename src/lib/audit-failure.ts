import type {
  AuditFailureDetails,
  AuditFailureKind,
  AuditFailureStage,
  AuditStatus,
} from "@/lib/types";

const BOT_CHALLENGE_PATTERNS = [
  /captcha/i,
  /verify you are human/i,
  /are you human/i,
  /security check/i,
  /attention required/i,
  /cloudflare/i,
  /perimeterx/i,
  /akamai/i,
  /incapsula/i,
  /bot challenge/i,
];

const AUTH_WALL_PATTERNS = [
  /\bsign in\b/i,
  /\blog in\b/i,
  /\blogin\b/i,
  /\bauth(?:entication)? required\b/i,
  /\brequires authentication\b/i,
  /\bmember access\b/i,
  /\baccount required\b/i,
  /\bplease sign in\b/i,
];

const ACCESS_DENIED_PATTERNS = [
  /\baccess denied\b/i,
  /\bforbidden\b/i,
  /\bpermission denied\b/i,
  /\bnot authorized\b/i,
  /\bunauthorized\b/i,
];

const DNS_FAILURE_PATTERNS = [
  /\berr_name_not_resolved\b/i,
  /\benotfound\b/i,
  /\beai_again\b/i,
  /\bdns\b/i,
];

const TIMEOUT_PATTERNS = [
  /\btimeout\b/i,
  /\btimed out\b/i,
  /\bnavigation timeout\b/i,
];

const BROWSER_LAUNCH_PATTERNS = [
  /\bbrowser launch\b/i,
  /\bchromium\b/i,
  /\bbrowsertype\.launch\b/i,
  /\bplaywright chromium is unavailable\b/i,
  /\betxtbsy\b/i,
  /\bexecutable doesn't exist\b/i,
];

const MAX_FAILURE_MESSAGE_LENGTH = 280;

export interface ClassifiedAuditFailure {
  failureKind: AuditFailureKind;
  failureStage: AuditFailureStage;
  failureReason: string;
  failureDetails: AuditFailureDetails;
}

export interface AuditFailureClassificationInput {
  stage: AuditFailureStage;
  message?: string | null;
  statusCode?: number;
  html?: string | null;
  url?: string | null;
  driver?: string | null;
}

export interface AuditFailurePresentation {
  label: string;
  explanation: string;
  retryGuidance: string | null;
  stageLabel: string;
}

type FailureSource = NonNullable<AuditFailureDetails["source"]>;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function trimMessage(value: string) {
  return value.slice(0, MAX_FAILURE_MESSAGE_LENGTH);
}

function toFailureDetails(input: AuditFailureClassificationInput) {
  const message = trimMessage(normalizeText(input.message));

  return {
    url: input.url ?? undefined,
    statusCode: input.statusCode,
    driver: input.driver ?? undefined,
    message: message || undefined,
  };
}

function extractStatusCode(message: string) {
  const match = message.match(/\bstatus[:\s]+(401|403|429)\b/i) ?? message.match(/\b(401|403|429)\b/);
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

function buildFailure(
  kind: AuditFailureKind,
  stage: AuditFailureStage,
  reason: string,
  details: AuditFailureDetails
): ClassifiedAuditFailure {
  return {
    failureKind: kind,
    failureStage: stage,
    failureReason: reason,
    failureDetails: details,
  };
}

function getFailureStageLabel(stage: AuditFailureStage) {
  switch (stage) {
    case "discover":
      return "Discovery";
    case "capture":
      return "Capture";
    case "analyze":
      return "Analysis";
    case "report":
      return "Report assembly";
  }
}

function classifyTargetBarrier(
  input: AuditFailureClassificationInput & { statusCode?: number }
): ClassifiedAuditFailure | null {
  const message = normalizeText(input.message);
  const html = normalizeText(input.html);
  const combined = `${message} ${html}`.trim();
  const statusCode = input.statusCode;
  const botChallenge = hasPattern(combined, BOT_CHALLENGE_PATTERNS);
  const authWall = statusCode === 401 || hasPattern(combined, AUTH_WALL_PATTERNS);
  const accessDenied = statusCode === 403 || hasPattern(combined, ACCESS_DENIED_PATTERNS);
  const rateLimited = statusCode === 429;

  if (rateLimited) {
    return buildFailure(
      "blocked",
      input.stage,
      "The target rate-limited automated capture before a usable snapshot was collected.",
      {
        ...toFailureDetails(input),
        source: "target",
        marker: "http_429",
        retryable: true,
      }
    );
  }

  if (botChallenge) {
    return buildFailure(
      "capture_blocked",
      input.stage,
      "The audit reached a security or bot-challenge page instead of the requested content. That means capture was blocked, not that the site is broken.",
      {
        ...toFailureDetails(input),
        source: "target",
        marker: "bot_challenge",
        retryable: false,
      }
    );
  }

  if (authWall) {
    return buildFailure(
      "auth_wall",
      input.stage,
      "The requested page requires a signed-in or authenticated session, so the audit could not capture it as a public page.",
      {
        ...toFailureDetails(input),
        source: "target",
        marker: statusCode === 401 ? "http_401" : "auth_wall",
        retryable: false,
      }
    );
  }

  if (accessDenied) {
    return buildFailure(
      "access_denied",
      input.stage,
      "The target denied this audit request. That does not prove the site is broken for regular visitors.",
      {
        ...toFailureDetails(input),
        source: "target",
        marker: statusCode === 403 ? "http_403" : "access_denied",
        retryable: false,
      }
    );
  }

  return null;
}

export function detectAuditCaptureBarrier(
  input: AuditFailureClassificationInput
): ClassifiedAuditFailure | null {
  return classifyTargetBarrier(input);
}

export function classifyAuditFailure(
  input: AuditFailureClassificationInput
): ClassifiedAuditFailure {
  const message = normalizeText(input.message);
  const inferredStatusCode = input.statusCode ?? extractStatusCode(message);
  const barrier = classifyTargetBarrier({
    ...input,
    statusCode: inferredStatusCode,
  });

  if (barrier) {
    return barrier;
  }

  if (input.stage === "analyze") {
    return buildFailure(
      "analysis_error",
      input.stage,
      message
        ? `The analysis step failed: ${message}`
        : "Capture completed, but the analysis step failed before a trustworthy report could be assembled.",
      {
        ...toFailureDetails(input),
        source: "analysis",
        marker: "analysis_exception",
        retryable: true,
      }
    );
  }

  if (hasPattern(message, DNS_FAILURE_PATTERNS)) {
    return buildFailure(
      "runtime_error",
      input.stage,
      "The target could not be reached from the audit runtime. That does not by itself prove the site is down.",
      {
        ...toFailureDetails(input),
        source: "network",
        marker: "dns_error",
        retryable: true,
      }
    );
  }

  if (hasPattern(message, TIMEOUT_PATTERNS)) {
    return buildFailure(
      "runtime_error",
      input.stage,
      "Navigation timed out before the requested page could be captured from the audit runtime.",
      {
        ...toFailureDetails(input),
        source: "network",
        marker: "navigation_timeout",
        retryable: true,
      }
    );
  }

  if (hasPattern(message, BROWSER_LAUNCH_PATTERNS)) {
    return buildFailure(
      "runtime_error",
      input.stage,
      message || "The audit browser runtime failed before capture could start.",
      {
        ...toFailureDetails(input),
        source: "runtime",
        marker: "browser_launch",
        retryable: true,
      }
    );
  }

  return buildFailure(
    input.stage === "report" ? "runtime_error" : "unknown",
    input.stage,
    message ||
      (input.stage === "report"
        ? "The report status view could not be assembled from the current run data."
        : "The audit stopped before it could produce a trustworthy result."),
    {
      ...toFailureDetails(input),
      source: input.stage === "report" ? "runtime" : "unknown",
      marker: "unknown",
      retryable: true,
    }
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

export class AuditFailureError extends Error {
  constructor(readonly failure: ClassifiedAuditFailure) {
    super(failure.failureReason);
    this.name = "AuditFailureError";
  }
}

export function toAuditFailure(
  error: unknown,
  input: Omit<AuditFailureClassificationInput, "message">
): ClassifiedAuditFailure {
  if (error instanceof AuditFailureError) {
    return error.failure;
  }

  return classifyAuditFailure({
    ...input,
    message: toErrorMessage(error),
  });
}

function buildRetryGuidance(kind: AuditFailureKind, source: FailureSource, retryable?: boolean) {
  if (kind === "blocked") {
    return retryable
      ? "Retry later may work if the block was temporary, but allowlisting the audit runtime is more reliable."
      : "Retry only after the target explicitly allows automated capture.";
  }

  if (kind === "capture_blocked") {
    return "Retry only after the target allows automated capture or the security challenge is bypassed for the audited pages.";
  }

  if (kind === "access_denied") {
    return "Retry only if the requested pages are intended to be publicly accessible or the audit runtime has been allowlisted.";
  }

  if (kind === "auth_wall") {
    return "Retry only with approved access or by auditing public pages instead of signed-in flows.";
  }

  if (kind === "analysis_error") {
    return "Retry after checking the analysis logs or rerunning the audit from the stored snapshots.";
  }

  if (kind === "runtime_error" && source === "runtime") {
    return "Retry after checking deployment logs, browser dependencies, or the configured capture runtime.";
  }

  if (kind === "runtime_error" && source === "network") {
    return "Retry after verifying the domain resolves and is reachable from the audit runtime.";
  }

  return retryable ? "Retry after checking the run diagnostics." : null;
}

function buildFailureLabel(kind: AuditFailureKind, source: FailureSource) {
  switch (kind) {
    case "blocked":
      return "Target blocked automated capture";
    case "access_denied":
      return "Access denied by target";
    case "auth_wall":
      return "Authentication required";
    case "capture_blocked":
      return "Security challenge blocked capture";
    case "analysis_error":
      return "Analysis step failed";
    case "runtime_error":
      return source === "network" ? "Target could not be reached" : "Audit runtime failed";
    case "unknown":
    default:
      return "Audit could not complete";
  }
}

export function getAuditFailurePresentation(input: {
  status?: AuditStatus;
  failureKind?: AuditFailureKind | null;
  failureStage?: AuditFailureStage | null;
  failureReason?: string | null;
  failureDetails?: AuditFailureDetails | null;
}): AuditFailurePresentation | null {
  if (input.status !== "failed" && !input.failureReason) {
    return null;
  }

  const fallback = classifyAuditFailure({
    stage: input.failureStage ?? "capture",
    message: input.failureReason,
  });
  const failureKind = input.failureKind ?? fallback.failureKind;
  const failureStage = input.failureStage ?? fallback.failureStage;
  const failureDetails = {
    ...fallback.failureDetails,
    ...(input.failureDetails ?? {}),
  };
  const failureReason = input.failureReason ?? fallback.failureReason;
  const source = failureDetails.source ?? "unknown";

  return {
    label: buildFailureLabel(failureKind, source),
    explanation: failureReason,
    retryGuidance: buildRetryGuidance(failureKind, source, failureDetails.retryable),
    stageLabel: getFailureStageLabel(failureStage),
  };
}
