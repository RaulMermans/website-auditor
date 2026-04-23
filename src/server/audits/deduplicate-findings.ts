import type { CreateFindingInput } from "@/db/analysis";

type DeduplicableFinding = Pick<
  CreateFindingInput,
  | "category"
  | "title"
  | "description"
  | "severity"
  | "confidence"
  | "evidenceLevel"
  | "evidenceRef"
> &
  Partial<
    Pick<
      CreateFindingInput,
      | "auditRunId"
      | "pageSnapshotId"
      | "claimPosture"
      | "supportType"
      | "evaluatorStatus"
      | "evaluatorNotes"
      | "recommendation"
      | "reviewStatus"
      | "reviewReason"
    >
  >;

const SEVERITY_RANK: Record<DeduplicableFinding["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const CONFIDENCE_RANK: Record<DeduplicableFinding["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const EVIDENCE_RANK: Record<DeduplicableFinding["evidenceLevel"], number> = {
  Measured: 3,
  Observed: 2,
  Inferred: 1,
};

const TITLE_PATTERNS = [
  { pattern: /missing.*page title|missing.*title/i, key: "missing_title" },
  { pattern: /missing.*meta description/i, key: "missing_meta_description" },
  { pattern: /missing.*canonical/i, key: "missing_canonical" },
  { pattern: /robots meta.*noindex/i, key: "robots_noindex" },
  { pattern: /no h1 heading detected/i, key: "missing_h1" },
  { pattern: /multiple h1/i, key: "multiple_h1" },
  { pattern: /heading levels skip|skipped heading/i, key: "skipped_heading_levels" },
  { pattern: /images missing alt/i, key: "images_missing_alt_text" },
  { pattern: /missing viewport/i, key: "missing_viewport_meta" },
  { pattern: /primary next step is not yet clear|weak next-step conversion path|no clear next step/i, key: "weak_next_step_conversion_path" },
  { pattern: /placeholder|staging copy/i, key: "placeholder_copy_visible" },
  { pattern: /trust layer is thin|trust signal density/i, key: "low_trust_signal_density" },
  { pattern: /proof remains light|proof layer still feels thin|thin social proof/i, key: "thin_social_proof_layer" },
  { pattern: /contact cues are not easy to verify|contact clarity is weak/i, key: "weak_contact_clarity" },
  { pattern: /reassurance is limited|reassurance is thin/i, key: "missing_reassurance_near_conversion" },
  { pattern: /repeated cta/i, key: "repeated_cta_labels" },
  { pattern: /primary action is not clearly distinguished|primary and secondary actions compete/i, key: "competing_cta_hierarchy" },
  { pattern: /too many calls to action compete|cta overload/i, key: "cta_overload" },
  { pattern: /first step form asks for more|long form/i, key: "long_form_friction" },
  { pattern: /form adds friction/i, key: "form_usability_friction" },
  { pattern: /relatively high friction next step|high friction conversion path/i, key: "high_friction_only_path" },
  { pattern: /opening message stays broad above the fold|value proposition is still too generic/i, key: "weak_value_proposition" },
  { pattern: /broadens before one core offer is established|too many themes before one offer is clear/i, key: "offer_sprawl" },
  { pattern: /hero promise and downstream sections are only loosely connected|hero promise and downstream sections feel loosely connected/i, key: "headline_section_mismatch" },
  { pattern: /generic hero/i, key: "generic_hero_messaging" },
  { pattern: /dense on mobile|mobile form|mobile.*heavy/i, key: "mobile_friction" },
  { pattern: /section hierarchy makes the page harder to scan|main action area feels visually crowded|homepage flow feels busy/i, key: "ux_flow" },
  { pattern: /script footprint is heavier than expected|heavy script/i, key: "heavy_script_loading" },
  { pattern: /asset mix is heavier|dom complexity is high enough to add rendering overhead|rendering overhead/i, key: "performance_complexity" },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/^homepage-only audit:\s*/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFingerprint(title: string): string {
  return normalizeText(title).replace(/\s+/g, "_").slice(0, 100);
}

function extractIssueType(finding: DeduplicableFinding): string {
  const explicitIssueType = typeof finding.evidenceRef.issueType === "string"
    ? normalizeText(finding.evidenceRef.issueType)
    : "";

  if (explicitIssueType) {
    return explicitIssueType.replace(/\s+/g, "_");
  }

  const normalizedTitle = normalizeText(finding.title);
  const normalizedDescription = normalizeText(finding.description);
  const composite = `${normalizedTitle} ${normalizedDescription}`;

  const matchedPattern = TITLE_PATTERNS.find(({ pattern }) => pattern.test(composite));
  if (matchedPattern) {
    return matchedPattern.key;
  }

  return titleFingerprint(finding.title);
}

function getRepresentativeFinding<T extends DeduplicableFinding>(current: T, incoming: T) {
  const severityDelta = SEVERITY_RANK[incoming.severity] - SEVERITY_RANK[current.severity];
  if (severityDelta !== 0) {
    return severityDelta > 0 ? incoming : current;
  }

  const confidenceDelta =
    CONFIDENCE_RANK[incoming.confidence] - CONFIDENCE_RANK[current.confidence];
  if (confidenceDelta !== 0) {
    return confidenceDelta > 0 ? incoming : current;
  }

  const evidenceDelta =
    EVIDENCE_RANK[incoming.evidenceLevel] - EVIDENCE_RANK[current.evidenceLevel];
  if (evidenceDelta !== 0) {
    return evidenceDelta > 0 ? incoming : current;
  }

  return titleFingerprint(incoming.title).localeCompare(titleFingerprint(current.title)) < 0
    ? incoming
    : current;
}

function mergeArrayValues(...values: unknown[]) {
  return [...new Set(values.flatMap((value) => (Array.isArray(value) ? value : value ? [value] : [])))];
}

function mergeEvidenceRef(current: Record<string, unknown>, incoming: Record<string, unknown>) {
  const pageUrls = mergeArrayValues(current.pageUrls, current.pageUrl, incoming.pageUrls, incoming.pageUrl);
  const pageTypes = mergeArrayValues(current.pageTypes, current.pageType, incoming.pageTypes, incoming.pageType);
  const evidenceKeys = mergeArrayValues(current.evidenceKeys, incoming.evidenceKeys);
  const pageCount = Math.max(pageUrls.length, typeof current.pageCount === "number" ? current.pageCount : 0, typeof incoming.pageCount === "number" ? incoming.pageCount : 0);

  return {
    ...current,
    ...incoming,
    pageUrl: undefined,
    pageType: undefined,
    pageUrls,
    pageTypes,
    pageCount,
    evidenceKeys,
    issueType: current.issueType ?? incoming.issueType,
    businessImpact:
      current.businessImpact === "high" || incoming.businessImpact === "high"
        ? "high"
        : current.businessImpact === "medium" || incoming.businessImpact === "medium"
          ? "medium"
          : current.businessImpact ?? incoming.businessImpact,
  };
}

export function deduplicateFindings<T extends DeduplicableFinding>(findings: T[]): T[] {
  const seen = new Map<string, T>();

  for (const finding of findings) {
    const issueType = extractIssueType(finding);
    const key = `${finding.category}::${issueType}`;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, {
        ...finding,
        evidenceRef: mergeEvidenceRef({}, finding.evidenceRef as Record<string, unknown>),
      });
      continue;
    }

    const representative = getRepresentativeFinding(existing, finding);
    seen.set(key, {
      ...representative,
      severity:
        SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]
          ? finding.severity
          : existing.severity,
      confidence:
        CONFIDENCE_RANK[finding.confidence] > CONFIDENCE_RANK[existing.confidence]
          ? finding.confidence
          : existing.confidence,
      evidenceLevel:
        EVIDENCE_RANK[finding.evidenceLevel] > EVIDENCE_RANK[existing.evidenceLevel]
          ? finding.evidenceLevel
          : existing.evidenceLevel,
      evidenceRef: mergeEvidenceRef(
        existing.evidenceRef as Record<string, unknown>,
        finding.evidenceRef as Record<string, unknown>
      ),
    });
  }

  return Array.from(seen.values());
}
