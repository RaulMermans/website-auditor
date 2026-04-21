import type { Finding, FindingCategory } from "@/lib/types";

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
