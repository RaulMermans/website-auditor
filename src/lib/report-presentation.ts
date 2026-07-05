import type {
  AuditFailureDetails,
  AuditFailureKind,
  AuditStatus,
  CaptureFidelity,
  Finding,
  FindingCategory,
} from "@/lib/types";

export const OVERALL_SCORE_LABEL = "Brand Conversion Readiness Score";
export const REPORT_READY_STATUSES: AuditStatus[] = ["complete", "partial_complete"];

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  performance: "Performance",
  technical_seo: "Technical SEO",
  accessibility: "Accessibility",
  ux_ui: "Experience Flow",
  messaging_content: "Brand Clarity & Messaging",
  conversion: "Conversion Path",
  trust_signals: "Trust & Proof",
  mobile_experience: "Mobile Experience",
};

export const SEVERITY_COLORS: Record<Finding["severity"], string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#65a30d",
  info: "#6b7280",
};

export const EVIDENCE_COLORS: Record<Finding["evidenceLevel"], string> = {
  Measured: "#0284c7",
  Observed: "#7c3aed",
  Inferred: "#9ca3af",
};

export const REVIEW_STATE_META = {
  inspected_clean: {
    label: "Inspected — no material issue surfaced",
    description:
      "No material issue surfaced in the inspected signals for this pass. This reflects inspection scope, not a definitive clean result.",
    background: "#f0fdf4",
    border: "#86efac",
    text: "#166534",
  },
  inspected_with_findings: {
    label: "Inspected with prioritized findings",
    description:
      "This category was meaningfully inspected and the findings below are worth addressing first.",
    background: "#fff7ed",
    border: "#fdba74",
    text: "#9a3412",
  },
  lightly_inspected: {
    label: "Lightly inspected",
    description:
      "Some deterministic checks ran, but coverage is still partial and the absence of more issues is not a clean result.",
    background: "#fffbeb",
    border: "#fcd34d",
    text: "#92400e",
  },
  limited_coverage: {
    label: "Limited coverage",
    description:
      "No material issue surfaced in the inspected secondary-static signals, but coverage is too limited to call this healthy.",
    background: "#fffbeb",
    border: "#fcd34d",
    text: "#92400e",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    description:
      "This category should be treated as unknown in the current pass rather than assumed to be healthy.",
    background: "#f8fafc",
    border: "#cbd5e1",
    text: "#475569",
  },
} as const;

export const AUDIT_STATUS_META: Record<
  AuditStatus,
  { label: string; description: string; background: string; border: string; text: string }
> = {
  pending: {
    label: "Queued",
    description: "The audit run has been created and is waiting to start.",
    background: "#f8fafc",
    border: "#cbd5e1",
    text: "#475569",
  },
  discovering: {
    label: "Discovering pages",
    description: "The system is selecting the priority pages to inspect in this run.",
    background: "#eff6ff",
    border: "#bfdbfe",
    text: "#1d4ed8",
  },
  capturing: {
    label: "Capturing evidence",
    description: "Browser snapshots and HTML evidence are being collected.",
    background: "#eff6ff",
    border: "#bfdbfe",
    text: "#1d4ed8",
  },
  analyzing: {
    label: "Assembling findings",
    description: "Deterministic findings, prioritization, and scoring are being generated.",
    background: "#eef2ff",
    border: "#c7d2fe",
    text: "#4338ca",
  },
  partial_complete: {
    label: "Partial/static report",
    description:
      "A bounded report is available, but browser capture, page coverage, or inspection depth was limited. Findings should be read with the limitation notes.",
    background: "#fffbeb",
    border: "#fcd34d",
    text: "#92400e",
  },
  needs_human_review: {
    label: "Needs review",
    description: "Multiple pages could not be verified automatically. Human review is required before trusting findings.",
    background: "#fff7ed",
    border: "#fdba74",
    text: "#9a3412",
  },
  complete: {
    label: "Report ready",
    description: "Both the concise and full report views are available.",
    background: "#f0fdf4",
    border: "#86efac",
    text: "#166534",
  },
  failed: {
    label: "Run failed",
    description: "The run stopped before a trustworthy report could be assembled.",
    background: "#fef2f2",
    border: "#fecaca",
    text: "#991b1b",
  },
};

type BadgeMeta = (typeof AUDIT_STATUS_META)[AuditStatus];

export const UNKNOWN_AUDIT_STATUS_META: BadgeMeta = {
  label: "Unknown",
  description: "This run reported a status that the report UI does not recognize yet.",
  background: "#f8fafc",
  border: "#cbd5e1",
  text: "#475569",
};

const KNOWN_AUDIT_STATUSES = new Set<AuditStatus>(Object.keys(AUDIT_STATUS_META) as AuditStatus[]);

function isKnownAuditStatus(status: unknown): status is AuditStatus {
  return typeof status === "string" && KNOWN_AUDIT_STATUSES.has(status as AuditStatus);
}

/**
 * Looks up status badge metadata defensively. Unknown, null, or legacy
 * status values fall back to UNKNOWN_AUDIT_STATUS_META instead of crashing.
 */
export function getAuditStatusMeta(status: unknown): BadgeMeta {
  return isKnownAuditStatus(status) ? AUDIT_STATUS_META[status] : UNKNOWN_AUDIT_STATUS_META;
}

export function isReportReadyStatus(status: unknown): boolean {
  return isKnownAuditStatus(status) && REPORT_READY_STATUSES.includes(status);
}

/**
 * Returns a badge with a label tuned to the combination of run status and
 * capture fidelity.  Callers that want the generic status badge can omit
 * primaryFidelity and will receive the default AUDIT_STATUS_META entry.
 */
export function getReportBadge(
  status: AuditStatus,
  primaryFidelity?: CaptureFidelity
): BadgeMeta {
  const base = getAuditStatusMeta(status);

  if (status === "complete" && primaryFidelity === "rendered_browser") {
    return { ...base, label: "Rendered audit" };
  }

  if (status === "partial_complete") {
    if (primaryFidelity === "rendered_browser") {
      return { ...base, label: "Mixed capture audit" };
    }
    if (primaryFidelity === "static_public") {
      return { ...base, label: "Static fallback audit" };
    }
    if (primaryFidelity === "secondary_static") {
      return { ...base, label: "Partial/static audit" };
    }
    if (primaryFidelity === "blocked_no_evidence") {
      return { ...base, label: "Limited evidence audit" };
    }
  }

  return base;
}

const HOMEPAGE_ONLY_PREFIX = /^Homepage-only audit:\s*/i;
const STATIC_CAPTURE_FIDELITIES = new Set<CaptureFidelity>(["static_public", "secondary_static"]);
const STATIC_CAPTURE_METHODS = new Set(["static", "fallback_static", "secondary_static"]);

const CAPTURE_BOUND_FINDING_COPY: Record<
  string,
  {
    staticTitle: string;
    secondaryTitle: string;
    staticWhat: string;
    secondaryWhat: string;
  }
> = {
  missing_title: {
    staticTitle: "Title tag not detected in captured static HTML",
    secondaryTitle: "Title tag not detected in captured secondary static HTML",
    staticWhat:
      "The captured static HTML did not expose a non-empty <title> tag. The live rendered page may still differ, so this is bounded to the stored static snapshot.",
    secondaryWhat:
      "The captured secondary static HTML did not expose a non-empty <title> tag. The live rendered page and excluded homepage may still differ, so this is bounded to the inspected secondary static snapshot.",
  },
  missing_h1: {
    staticTitle: "H1 heading not detected in captured static HTML",
    secondaryTitle: "H1 heading not detected in captured secondary static HTML",
    staticWhat:
      "The captured static HTML did not expose an H1 heading. The live rendered page may still differ, so this is bounded to the stored static snapshot.",
    secondaryWhat:
      "The captured secondary static HTML did not expose an H1 heading. The live rendered page and excluded homepage may still differ, so this is bounded to the inspected secondary static snapshot.",
  },
  missing_canonical: {
    staticTitle: "Canonical tag not exposed in captured static HTML",
    secondaryTitle: "Canonical tag not exposed in captured secondary static HTML",
    staticWhat:
      "The captured static HTML did not expose a canonical link tag. The live rendered page may still differ, so this is bounded to the stored static snapshot.",
    secondaryWhat:
      "The captured secondary static HTML did not expose a canonical link tag. The live rendered page and excluded homepage may still differ, so this is bounded to the inspected secondary static snapshot.",
  },
  missing_meta_description: {
    staticTitle: "Meta description not detected in captured static HTML",
    secondaryTitle: "Meta description not detected in captured secondary static HTML",
    staticWhat:
      "The captured static HTML did not expose a meta description. The live rendered page may still differ, so this is bounded to the stored static snapshot.",
    secondaryWhat:
      "The captured secondary static HTML did not expose a meta description. The live rendered page and excluded homepage may still differ, so this is bounded to the inspected secondary static snapshot.",
  },
};

const CAPTURE_BOUND_TITLE_TO_ISSUE: Record<string, keyof typeof CAPTURE_BOUND_FINDING_COPY> = {
  "missing page title": "missing_title",
  "title tag not detected in captured static html": "missing_title",
  "title tag not detected in captured secondary static html": "missing_title",
  "no h1 heading detected": "missing_h1",
  "h1 heading not detected in captured static html": "missing_h1",
  "h1 heading not detected in captured secondary static html": "missing_h1",
  "missing canonical tag": "missing_canonical",
  "canonical tag not exposed in captured static html": "missing_canonical",
  "canonical tag not exposed in captured secondary static html": "missing_canonical",
  "missing meta description": "missing_meta_description",
  "meta description not detected in captured static html": "missing_meta_description",
  "meta description not detected in captured secondary static html": "missing_meta_description",
};

const EXPECTED_TERMINAL_FAILURE_KINDS = new Set<AuditFailureKind>([
  "access_denied",
  "blocked",
  "capture_blocked",
  "auth_wall",
]);

/**
 * Formats a date defensively for display. Null, undefined, or unparseable
 * values render as "—" instead of throwing or printing "Invalid Date".
 */
export function safeFormatDate(value: unknown): string {
  if (value === null || value === undefined) return "—";

  const date = value instanceof Date ? value : new Date(value as string | number);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function scoreColor(score: number) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#d97706";
  return "#dc2626";
}

export function stripHomepageScopePrefix(text: string) {
  return text.replace(HOMEPAGE_ONLY_PREFIX, "").trim();
}

function normalizeFindingTitle(title: string) {
  return stripHomepageScopePrefix(title)
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getIssueKey(title: string): keyof typeof CAPTURE_BOUND_FINDING_COPY | null {
  return CAPTURE_BOUND_TITLE_TO_ISSUE[normalizeFindingTitle(title)] ?? null;
}

function sanitizeStaticOnlyClaimLanguage(text: string) {
  return stripHomepageScopePrefix(text)
    .replace(/\babove[-\s]the[-\s]fold(?:\s+UX|\s+composition)?\b/gi, "opening-page")
    .replace(/\bvisual hierarchy\b/gi, "content hierarchy")
    .replace(/\bmobile layout\b/gi, "small-screen structure")
    .replace(/\brendered interaction states?\b/gi, "rendered states")
    .replace(/\binteraction behavior\b/gi, "interactive-state evidence")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCaptureBoundFindingDisplay(input: {
  title: string;
  whatWeFound: string;
  captureFidelity: CaptureFidelity;
  captureMethod?: string | null;
}): { title: string; whatWeFound: string } {
  const method = input.captureMethod ?? undefined;
  const shouldBound =
    STATIC_CAPTURE_FIDELITIES.has(input.captureFidelity) ||
    (method ? STATIC_CAPTURE_METHODS.has(method) : false);

  if (!shouldBound) {
    return {
      title: stripHomepageScopePrefix(input.title),
      whatWeFound: stripHomepageScopePrefix(input.whatWeFound),
    };
  }

  const issueKey = getIssueKey(input.title);
  if (!issueKey) {
    return {
      title: sanitizeStaticOnlyClaimLanguage(input.title),
      whatWeFound: sanitizeStaticOnlyClaimLanguage(input.whatWeFound),
    };
  }

  const copy = CAPTURE_BOUND_FINDING_COPY[issueKey];
  const useSecondary =
    input.captureFidelity === "secondary_static" || input.captureMethod === "secondary_static";

  return {
    title: useSecondary ? copy.secondaryTitle : copy.staticTitle,
    whatWeFound: useSecondary ? copy.secondaryWhat : copy.staticWhat,
  };
}

export function shouldDisplayLimitationNote(status: AuditStatus, limitationNote?: string | null) {
  return Boolean(limitationNote) && status !== "failed";
}

export function isExpectedTerminalCaptureFailure(input: {
  failureKind?: AuditFailureKind | string | null;
  failureDetails?: AuditFailureDetails | null;
  failureReason?: string | null;
  errorMessage?: string | null;
}) {
  const kind = input.failureKind;
  const marker = input.failureDetails?.marker;
  const reason = `${input.failureReason ?? ""} ${input.errorMessage ?? ""}`.toLowerCase();

  return (
    (typeof kind === "string" && EXPECTED_TERMINAL_FAILURE_KINDS.has(kind as AuditFailureKind)) ||
    marker === "bot_challenge" ||
    reason.includes("no trustworthy public html evidence") ||
    reason.includes("no usable public evidence") ||
    reason.includes("protection page") ||
    reason.includes("bot-challenge") ||
    reason.includes("security challenge") ||
    reason.includes("target denied")
  );
}

export function getFindingSupportLabel(
  finding: Pick<Finding, "evidenceRef">
) {
  const pageCount =
    typeof finding.evidenceRef.pageCount === "number"
      ? finding.evidenceRef.pageCount
      : finding.evidenceRef.pageUrl
        ? 1
        : 0;
  const evidenceKeyCount = Array.isArray(finding.evidenceRef.evidenceKeys)
    ? finding.evidenceRef.evidenceKeys.length
    : 0;
  const parts: string[] = [];

  if (pageCount > 0) {
    parts.push(`${pageCount} page${pageCount !== 1 ? "s" : ""}`);
  }

  if (evidenceKeyCount > 0) {
    parts.push(`${evidenceKeyCount} signal${evidenceKeyCount !== 1 ? "s" : ""}`);
  }

  return parts.join(" · ") || "Limited support";
}
