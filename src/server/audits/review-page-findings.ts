import type { CreateFindingInput, CreatePageEvidenceInput } from "@/db/analysis";
import type {
  ClaimPosture,
  EvidenceLabel,
  FindingConfidence,
  FindingSeverity,
  FindingSupportType,
  PageEvaluatorStatus,
  PageReviewStatus,
  PageSnapshot,
  PageState,
} from "@/lib/types";
import { getRoutedPageContext, pageAllowsIssuePattern } from "@/server/audits/page-rubrics";

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const CONFIDENCE_RANK: Record<FindingConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const EVIDENCE_RANK: Record<EvidenceLabel, number> = {
  Measured: 3,
  Observed: 2,
  Inferred: 1,
};

const CONTRADICTION_MAP: Record<string, string[]> = {
  missing_h1: ["multiple_h1"],
  multiple_h1: ["missing_h1"],
  weak_next_step_conversion_path: [
    "competing_cta_hierarchy",
    "cta_overload",
    "repeated_cta_labels",
  ],
  competing_cta_hierarchy: ["weak_next_step_conversion_path"],
  cta_overload: ["weak_next_step_conversion_path"],
  repeated_cta_labels: ["weak_next_step_conversion_path"],
  low_trust_signal_density: ["thin_social_proof_layer"],
  thin_social_proof_layer: ["low_trust_signal_density"],
};

export interface PageFindingReviewInput {
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType" | "pagePriority"> &
    Partial<Pick<PageSnapshot, "retryCount">>;
  pageEvidence: CreatePageEvidenceInput[];
  findings: CreateFindingInput[];
}

export interface PageFindingReviewResult {
  findings: CreateFindingInput[];
  acceptedFindings: CreateFindingInput[];
  reviewStatus: PageReviewStatus;
  evaluatorStatus: PageEvaluatorStatus;
  retryCount: number;
  escalationReason: string | null;
  pageState: Extract<PageState, "accepted" | "needs_review">;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/^homepage-only audit:\s*/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getIssueType(finding: CreateFindingInput) {
  const explicitIssueType =
    typeof finding.evidenceRef.issueType === "string"
      ? normalizeText(finding.evidenceRef.issueType)
      : "";

  if (explicitIssueType) {
    return explicitIssueType.replace(/\s+/g, "_");
  }

  return normalizeText(finding.title).replace(/\s+/g, "_").slice(0, 100);
}

function compareFindingStrength(left: CreateFindingInput, right: CreateFindingInput) {
  const severityDelta = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const confidenceDelta = CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  return EVIDENCE_RANK[right.evidenceLevel] - EVIDENCE_RANK[left.evidenceLevel];
}

function deriveClaimPosture(evidenceLevel: EvidenceLabel): ClaimPosture {
  if (evidenceLevel === "Measured") {
    return "confirmed";
  }

  if (evidenceLevel === "Observed") {
    return "observed_pattern";
  }

  return "directional";
}

function deriveSupportType(finding: CreateFindingInput): FindingSupportType {
  if (finding.evidenceLevel === "Inferred") {
    return "inferred";
  }

  const pageCount =
    typeof finding.evidenceRef.pageCount === "number"
      ? finding.evidenceRef.pageCount
      : finding.evidenceRef.pageUrl
        ? 1
        : 0;

  return pageCount > 1 ? "cross_page" : "dom";
}

function mergeEvaluatorNotes(...notes: Array<string | null | undefined>) {
  const normalized = [...new Set(notes.map((note) => note?.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized.join(" ") : null;
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function softenDirectionalText(text: string) {
  return text
    .replace(/\bis not yet\b/gi, "may not yet be")
    .replace(/\bis not\b/gi, "may not be")
    .replace(/\bare not\b/gi, "may not be")
    .replace(/\bdoes not\b/gi, "may not")
    .replace(/\bdo not\b/gi, "may not")
    .replace(/\bcontains\b/gi, "appears to contain")
    .replace(/\bcreates\b/gi, "can create")
    .replace(/\bshows\b/gi, "suggests")
    .replace(/\brelies on\b/gi, "appears to rely on")
    .replace(/\bwill\b/gi, "can");
}

function calibrateFinding(finding: CreateFindingInput): CreateFindingInput {
  const evaluatorNotes: string[] = [];
  let title = finding.title;
  let description = finding.description;
  let severity = finding.severity;
  let confidence = finding.confidence;

  if (finding.evidenceLevel === "Inferred") {
    const softenedTitle = softenDirectionalText(title);
    const softenedDescription = softenDirectionalText(description);

    if (softenedTitle !== title || softenedDescription !== description) {
      evaluatorNotes.push("Evaluator softened directional wording.");
      title = softenedTitle;
      description = softenedDescription;
    }

    if (SEVERITY_RANK[severity] > SEVERITY_RANK.medium) {
      severity = "medium";
      evaluatorNotes.push("Evaluator capped severity for inferred support.");
    }

    if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK.medium) {
      confidence = "medium";
      evaluatorNotes.push("Evaluator capped confidence for inferred support.");
    }
  } else if (finding.evidenceLevel === "Observed" && severity === "critical") {
    severity = "high";
    evaluatorNotes.push("Evaluator capped severity for pattern-level support.");
  }

  return {
    ...finding,
    title,
    description,
    severity,
    confidence,
    claimPosture: deriveClaimPosture(finding.evidenceLevel),
    supportType: deriveSupportType(finding),
    evaluatorStatus: "accepted",
    evaluatorNotes: mergeEvaluatorNotes(finding.evaluatorNotes, ...evaluatorNotes),
    reviewStatus: "accepted",
    reviewReason: null,
  };
}

function buildNeedsReviewFinding(finding: CreateFindingInput, note: string): CreateFindingInput {
  return {
    ...finding,
    claimPosture: finding.claimPosture ?? deriveClaimPosture(finding.evidenceLevel),
    supportType: finding.supportType ?? deriveSupportType(finding),
    evaluatorStatus: "needs_review",
    evaluatorNotes: mergeEvaluatorNotes(finding.evaluatorNotes, note),
    reviewStatus: "needs_review",
    reviewReason: note,
  };
}

function getEvidenceKeys(finding: CreateFindingInput) {
  return Array.isArray(finding.evidenceRef.evidenceKeys)
    ? finding.evidenceRef.evidenceKeys.filter((key): key is string => typeof key === "string")
    : [];
}

function areContradictory(leftIssueType: string, rightIssueType: string) {
  return (
    leftIssueType === rightIssueType ||
    CONTRADICTION_MAP[leftIssueType]?.includes(rightIssueType) === true ||
    CONTRADICTION_MAP[rightIssueType]?.includes(leftIssueType) === true
  );
}

function getRoutingReviewReasons(
  snapshot: PageFindingReviewInput["snapshot"],
  rawFinding: CreateFindingInput,
  issueType: string
) {
  const route = getRoutedPageContext(snapshot);
  const reasons: string[] = [];

  if (issueType && !pageAllowsIssuePattern(route, issueType)) {
    reasons.push(
      `${route.pageType} routing does not accept the "${issueType}" issue pattern without review`
    );
  }

  if (
    rawFinding.evidenceLevel === "Inferred" &&
    SEVERITY_RANK[rawFinding.severity] > SEVERITY_RANK.medium
  ) {
    reasons.push(
      `high-severity inferred finding "${rawFinding.title}" requires review before it becomes report truth`
    );
  }

  if (rawFinding.evidenceLevel === "Inferred" && rawFinding.confidence === "low") {
    reasons.push(
      `low-confidence inferred finding "${rawFinding.title}" requires review before it becomes report truth`
    );
  }

  return dedupe(reasons);
}

export function reviewPageFindings({
  snapshot,
  pageEvidence,
  findings,
}: PageFindingReviewInput): PageFindingReviewResult {
  const evidenceKeys = new Set(pageEvidence.map((evidence) => evidence.key));
  const acceptedFindings: CreateFindingInput[] = [];
  const reviewedFindings: CreateFindingInput[] = [];
  const escalationReasons: string[] = [];
  const acceptedIssueTypes = new Map<string, CreateFindingInput>();
  const currentRetryCount = snapshot.retryCount ?? 0;

  for (const rawFinding of [...findings].sort(compareFindingStrength)) {
    const finding = calibrateFinding(rawFinding);
    const issueType = getIssueType(finding);
    const issueKey = `${finding.category}::${issueType}`;
    const missingEvidenceKeys = getEvidenceKeys(finding).filter((key) => !evidenceKeys.has(key));
    const routingReviewReasons = getRoutingReviewReasons(snapshot, rawFinding, issueType);

    if (routingReviewReasons.length > 0) {
      const reviewedFinding = buildNeedsReviewFinding(
        finding,
        routingReviewReasons.join(" ")
      );
      escalationReasons.push(...routingReviewReasons);
      reviewedFindings.push(reviewedFinding);
      continue;
    }

    if (missingEvidenceKeys.length > 0) {
      const reviewedFinding = buildNeedsReviewFinding(
        finding,
        `Evaluator rejected the finding because evidence keys were missing: ${missingEvidenceKeys.join(", ")}.`
      );
      escalationReasons.push(`missing evidence for ${issueType}`);
      reviewedFindings.push(reviewedFinding);
      continue;
    }

    if (acceptedIssueTypes.has(issueKey)) {
      const reviewedFinding = buildNeedsReviewFinding(
        finding,
        `Evaluator rejected the finding as a duplicate of ${issueType}.`
      );
      escalationReasons.push(`duplicate ${issueType}`);
      reviewedFindings.push(reviewedFinding);
      continue;
    }

    const conflictingFinding = acceptedFindings.find(
      (candidate) =>
        candidate.category === finding.category &&
        areContradictory(issueType, getIssueType(candidate)) &&
        getIssueType(candidate) !== issueType
    );

    if (conflictingFinding) {
      const reviewedFinding = buildNeedsReviewFinding(
        finding,
        `Evaluator rejected the finding because it conflicts with ${getIssueType(conflictingFinding)}.`
      );
      escalationReasons.push(`contradiction with ${getIssueType(conflictingFinding)}`);
      reviewedFindings.push(reviewedFinding);
      continue;
    }

    acceptedIssueTypes.set(issueKey, finding);
    acceptedFindings.push(finding);
    reviewedFindings.push(finding);
  }

  const needsReview = escalationReasons.length > 0;

  return {
    findings: reviewedFindings,
    acceptedFindings,
    reviewStatus: needsReview ? "needs_review" : "accepted",
    evaluatorStatus: needsReview ? "needs_review" : "accepted",
    retryCount: needsReview ? currentRetryCount + 1 : currentRetryCount,
    escalationReason: needsReview ? dedupe(escalationReasons).join("; ") : null,
    pageState: needsReview ? "needs_review" : "accepted",
  };
}
