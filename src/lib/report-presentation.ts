import type { AuditStatus, Finding, FindingCategory } from "@/lib/types";

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  performance: "Performance",
  technical_seo: "Technical SEO",
  accessibility: "Accessibility",
  ux_ui: "UX / UI",
  messaging_content: "Messaging & Content",
  conversion: "Conversion",
  trust_signals: "Trust Signals",
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
    label: "Partial report",
    description: "Homepage captured and scored, but some pages were skipped or failed. Findings may be incomplete.",
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

const HOMEPAGE_ONLY_PREFIX = /^Homepage-only audit:\s*/i;

export function scoreColor(score: number) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#d97706";
  return "#dc2626";
}

export function stripHomepageScopePrefix(text: string) {
  return text.replace(HOMEPAGE_ONLY_PREFIX, "").trim();
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
