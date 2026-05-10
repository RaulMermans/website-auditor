import type { ReportCategoryReview, ReportData } from "@/db/report";
import type {
  ClaimPosture,
  EvidenceLabel,
  Finding,
  FindingCategory,
  FindingSeverity,
} from "@/lib/types";
import {
  CATEGORY_LABELS,
  getFindingSupportLabel,
  stripHomepageScopePrefix,
} from "@/lib/report-presentation";

const CATEGORY_IMPACT_NOTES: Record<FindingCategory, string> = {
  performance:
    "A heavier page footprint increases the chance that the first impression feels slower or less responsive, especially on constrained devices.",
  technical_seo:
    "Search engines and browsers receive weaker signals about page purpose, hierarchy, or the preferred indexing state.",
  accessibility:
    "Visitors using assistive technology lose context or fallback information that should be available by default.",
  ux_ui:
    "Scanning becomes harder when the layout gives too many elements similar visual weight or asks visitors to process too much at once.",
  messaging_content:
    "Visitors cannot quickly confirm who this is for, what they gain, or why this is the right choice — which increases exit rates before they ever reach a conversion action.",
  conversion:
    "The path from interest to action becomes less obvious or asks for more commitment than a first step usually should.",
  trust_signals:
    "The page gives visitors less reassurance at the point where they need confidence to move forward.",
  mobile_experience:
    "Small-screen visitors are more likely to hit density, friction, or long-scroll fatigue before reaching the key action.",
};

const CLEAN_CATEGORY_NOTES: Record<FindingCategory, string> = {
  performance:
    "No material performance issue surfaced in the inspected signals for this pass. Signals outside the captured scope were not assessed.",
  technical_seo:
    "No material search-facing issue surfaced in the inspected HTML and structural signals for this pass.",
  accessibility:
    "No material accessibility issue surfaced in the captured checks for this pass. Full WCAG coverage was not assessed.",
  ux_ui:
    "No clear scan-flow or layout hierarchy issue surfaced in the inspected structural signals for this pass.",
  messaging_content:
    "No clear clarity or positioning issue surfaced in the inspected messaging signals for this pass.",
  conversion:
    "No strong next-step or form-friction issue surfaced in the inspected conversion signals for this pass.",
  trust_signals:
    "No material reassurance gap surfaced in the inspected trust signals for this pass.",
  mobile_experience:
    "No obvious small-screen issue surfaced in the inspected mobile-oriented signals for this pass.",
};

const STRATEGIC_LENSES: Array<{
  title: string;
  categories: FindingCategory[];
  stableNote: string;
  limitedNote: string;
  insufficientNote: string;
  impactNote: string;
}> = [
  {
    title: "Brand Clarity",
    categories: ["messaging_content", "technical_seo"],
    stableNote:
      "The inspected brand clarity and messaging signals read comparatively stable, with no prioritized audience, positioning, or outcome issues surfaced in the current deterministic pass.",
    limitedNote:
      "Only partial brand clarity evidence was available here, so narrative judgments should be treated as directional rather than complete.",
    insufficientNote:
      "The current deterministic pass did not inspect brand clarity deeply enough to make a confident narrative call.",
    impactNote:
      "That weakens how quickly the page explains what it offers, who it is for, and why a visitor should keep going.",
  },
  {
    title: "Conversion Path",
    categories: ["conversion", "mobile_experience"],
    stableNote:
      "The inspected next-step journey looks comparatively stable in the current pass, with no prioritized conversion-path issues surfaced.",
    limitedNote:
      "The conversion-path signal is useful but incomplete because the current inspection depth was limited in one or more relevant categories.",
    insufficientNote:
      "The report does not have enough deterministic evidence to call the conversion path clean.",
    impactNote:
      "That increases the odds that interested visitors hesitate, postpone action, or take a less direct route.",
  },
  {
    title: "Trust & Proof",
    categories: ["trust_signals", "accessibility"],
    stableNote:
      "The inspected trust and reassurance signals did not surface a material confidence gap in the current pass.",
    limitedNote:
      "Some reassurance issues may still be present here because the current inspection depth was not exhaustive.",
    insufficientNote:
      "The current pass does not provide enough evidence to make a strong trust-layer judgment.",
    impactNote:
      "That leaves less reassurance around the point where visitors are deciding whether the business feels credible enough to contact or buy from.",
  },
  {
    title: "Experience Flow",
    categories: ["ux_ui", "performance"],
    stableNote:
      "The inspected flow and structural signals looked comparatively stable in the current deterministic pass.",
    limitedNote:
      "Experience-flow conclusions should stay bounded here because the current inspection depth is only partial.",
    insufficientNote:
      "The current pass does not provide enough deterministic evidence to judge overall experience flow with confidence.",
    impactNote:
      "That can make the experience feel heavier, busier, or harder to process than it needs to be.",
  },
];

const CLAIM_POSTURE_ORDER: ClaimPosture[] = [
  "confirmed",
  "observed_pattern",
  "directional",
];

const CLAIM_POSTURE_META: Record<
  ClaimPosture,
  { label: string; description: string }
> = {
  confirmed: {
    label: "Confirmed",
    description: "Directly supported by measured capture evidence in this audit.",
  },
  observed_pattern: {
    label: "Observed Pattern",
    description: "Visible in the captured experience, even where downstream impact was not benchmarked.",
  },
  directional: {
    label: "Directional",
    description: "Inference-backed risk from the captured signals rather than a directly measured defect.",
  },
};

export interface FullReportFinding {
  id: string;
  category: FindingCategory;
  categoryLabel: string;
  claimPosture: ClaimPosture;
  claimLabel: string;
  title: string;
  summary: string;
  severity: Finding["severity"];
  confidence: Finding["confidence"];
  evidenceLevel: Finding["evidenceLevel"];
  supportLabel: string;
  whyItMatters: string;
  risk: string;
  nextStep: string;
  evidenceNote: string;
}

export interface FullReportFindingGroup {
  posture: ClaimPosture;
  label: string;
  description: string;
  findings: FullReportFinding[];
}

export interface FullReportCategorySection {
  category: FindingCategory;
  label: string;
  score: number | null;
  inspectionStatus: ReportCategoryReview["inspectionStatus"];
  inspectionLabel: string;
  inspectionNote: string;
  interpretation: string;
  recommendations: string[];
  findings: FullReportFinding[];
  findingGroups: FullReportFindingGroup[];
}

export interface FullReportData {
  auditRunId: string;
  domain: string;
  executiveSummary: {
    overview: string;
    whatIsWorking: string[];
    whatIsLimiting: string[];
    inspectionFrame: string;
  };
  topPriorities: FullReportFinding[];
  topPriorityGroups: FullReportFindingGroup[];
  scoreSummary: {
    overall: number;
    inspectedCleanCategories: string[];
    lightlyInspectedCategories: string[];
    insufficientEvidenceCategories: string[];
  };
  categorySections: FullReportCategorySection[];
  strategicReadout: Array<{ title: string; body: string }>;
  nextActions: {
    quickWins: string[];
    mediumPriority: string[];
    strategic: string[];
  };
  appendix: {
    scopeNote: string;
    evidenceCounts: Record<EvidenceLabel, number>;
    severityCounts: Record<FindingSeverity, number>;
    inspectionNotes: string[];
    excludedPageNotes: string[];
  };
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function joinLabels(labels: string[]) {
  if (labels.length === 0) {
    return "";
  }

  if (labels.length === 1) {
    return labels[0]!;
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function groupFindingsByClaimPosture(findings: FullReportFinding[]) {
  return CLAIM_POSTURE_ORDER.map((posture) => ({
    posture,
    label: CLAIM_POSTURE_META[posture].label,
    description: CLAIM_POSTURE_META[posture].description,
    findings: findings.filter((finding) => finding.claimPosture === posture),
  })).filter((group) => group.findings.length > 0);
}

function describeOverallCondition(score: number) {
  if (score >= 85) {
    return "shows a comparatively disciplined foundation within the inspected signals for this pass, with targeted weaknesses rather than broad structural friction — uninspected areas are not reflected in this score";
  }

  if (score >= 70) {
    return "has a workable foundation, but several issues are still softening clarity, trust, or conversion efficiency";
  }

  if (score >= 55) {
    return "shows material friction across the inspected areas and would benefit from a focused remediation pass";
  }

  return "shows multiple high-priority issues in the inspected areas and needs a sharper correction pass before the experience feels consistently credible";
}

function getScopeSubject(data: ReportData) {
  return data.auditRun.homepageOnly ? "The homepage" : "The captured page set";
}

function buildScopeNote(data: ReportData) {
  const base = data.auditRun.homepageOnly
    ? "Homepage-only audit. Conclusions apply to the captured homepage snapshot and should not be generalized to the full site."
    : "Multi-page audit. Conclusions apply only to the captured page set included in this run.";

  return data.auditRun.limitationNote ? `${base} ${data.auditRun.limitationNote}` : base;
}

function getInspectionLabel(review: ReportCategoryReview) {
  if (review.reviewState === "insufficient_evidence") {
    return "Insufficient evidence";
  }

  if (review.reviewState === "lightly_inspected") {
    return "Lightly inspected";
  }

  if (review.reviewState === "inspected_clean") {
    return "No material issue surfaced";
  }

  return "Inspected with prioritized findings";
}

function getInspectionNote(review: ReportCategoryReview) {
  if (review.reviewState === "insufficient_evidence") {
    return "This category was not meaningfully covered in the current deterministic pass and should be treated as unknown.";
  }

  return `${review.observedChecks}/${review.expectedChecks} deterministic checks covered in this category during the current pass.`;
}

function getSeverityRisk(severity: Finding["severity"]) {
  switch (severity) {
    case "critical":
      return "This deserves prompt correction because it is likely to materially weaken a key page.";
    case "high":
      return "This is likely to suppress clarity, trust, or follow-through until it is corrected.";
    case "medium":
      return "This is a meaningful source of friction and is worth addressing in the next improvement pass.";
    case "low":
      return "This sits below the higher-priority issues, but tightening it should improve polish and consistency.";
    case "info":
    default:
      return "This is lower-stakes, but cleaning it up should improve execution quality.";
  }
}

function getEvidenceCalibration(finding: Finding) {
  if (finding.supportType === "cross_page") {
    return "Supported by repeatable DOM-backed signals across multiple captured pages in this audit.";
  }

  if (finding.claimPosture === "directional" || finding.supportType === "inferred") {
    return "Directional inference from captured signals rather than a confirmed measured defect; validate it against live UX or analytics while implementing.";
  }

  if (finding.evidenceLevel === "Measured") {
    return "Supported by direct markup or count-based evidence from the captured page.";
  }

  if (finding.evidenceLevel === "Observed") {
    return "Supported by visible page patterns in the capture; the pattern is concrete even though downstream impact was not benchmarked.";
  }
  return "Supported by visible page patterns in the capture rather than a direct benchmark-style measurement.";
}

function deriveClaimPosture(
  finding: Pick<Finding, "claimPosture" | "evidenceLevel">
): ClaimPosture {
  if (finding.claimPosture) {
    return finding.claimPosture;
  }

  if (finding.evidenceLevel === "Measured") {
    return "confirmed";
  }

  if (finding.evidenceLevel === "Observed") {
    return "observed_pattern";
  }

  return "directional";
}

function buildRiskStatement(finding: Finding) {
  const severityRisk = getSeverityRisk(finding.severity);

  if (finding.evidenceLevel === "Inferred") {
    return `${severityRisk} Treat the impact call as directional because it is inference-backed rather than directly measured.`;
  }

  if (finding.evidenceLevel === "Observed") {
    return `${severityRisk} The underlying pattern is visible in the captured experience, even if downstream impact was not directly measured here.`;
  }

  return `${severityRisk} The underlying issue is directly present in the captured page evidence.`;
}

function buildNarrativeFinding(finding: Finding): FullReportFinding {
  const claimPosture = deriveClaimPosture(finding);

  return {
    id: finding.id,
    category: finding.category,
    categoryLabel: CATEGORY_LABELS[finding.category],
    claimPosture,
    claimLabel: CLAIM_POSTURE_META[claimPosture].label,
    title: stripHomepageScopePrefix(finding.title),
    summary: stripHomepageScopePrefix(finding.description),
    severity: finding.severity,
    confidence: finding.confidence,
    evidenceLevel: finding.evidenceLevel,
    supportLabel: getFindingSupportLabel(finding),
    whyItMatters: CATEGORY_IMPACT_NOTES[finding.category],
    risk: buildRiskStatement(finding),
    nextStep: stripHomepageScopePrefix(finding.recommendation),
    evidenceNote: getEvidenceCalibration(finding),
  };
}

function buildCategoryInterpretation(
  review: ReportCategoryReview,
  narrativeFindings: FullReportFinding[]
) {
  if (review.reviewState === "insufficient_evidence") {
    return "This area remains outside meaningful deterministic coverage in the current pass. Treat it as unknown rather than healthy.";
  }

  if (review.reviewState === "lightly_inspected") {
    return review.findingCount > 0
      ? "This category surfaced credible issues, but inspection depth was only partial. The listed findings are usable within the captured signals, yet the category was not fully assessed and the absence of additional issues is not a clean bill of health."
      : "Only limited checks ran here. No issues surfaced, but the category was not fully assessed and should not be treated as clean.";
  }

  if (review.reviewState === "inspected_clean") {
    return CLEAN_CATEGORY_NOTES[review.category];
  }

  const leadFinding = narrativeFindings[0];
  if (!leadFinding) {
    return `${CATEGORY_LABELS[review.category]} shows credible pressure in the current deterministic pass.`;
  }

  if (leadFinding.claimPosture === "directional") {
    return `${CATEGORY_LABELS[review.category]} surfaced directional pressure in the current pass. The lead concern is "${leadFinding.title}", but the impact call stays conditional because the strongest support here is inference-backed rather than directly measured.`;
  }

  if (leadFinding.claimPosture === "observed_pattern") {
    return `${CATEGORY_LABELS[review.category]} shows visible pattern-level friction in this audit. The lead issue is "${leadFinding.title}", and inspection depth is strong enough to treat the surfaced pattern as meaningful even without downstream benchmarking.`;
  }

  return `${CATEGORY_LABELS[review.category]} is a genuine pressure point in this audit. The lead issue is "${leadFinding.title}", and inspection depth is strong enough to treat the surfaced problems as credible category friction rather than isolated noise.`;
}

function buildExecutiveSummary(
  data: ReportData,
  topPriorities: FullReportFinding[],
  categorySections: FullReportCategorySection[]
) {
  const inspectedCleanCategories = categorySections
    .filter((section) => section.inspectionLabel === "No material issue surfaced")
    .map((section) => section.label);
  const whatIsWorking =
    inspectedCleanCategories.length > 0
      ? [
          `${joinLabels(inspectedCleanCategories)} read comparatively steady within the inspected signals.`,
        ]
      : ["No inspected category reads fully settled yet in the current pass."];
  const whatIsLimiting =
    topPriorities.length > 0
      ? topPriorities
          .slice(0, 3)
          .map((finding) => `${finding.claimLabel}: ${finding.categoryLabel}: ${finding.summary}`)
      : ["No prioritized issues were generated from the current deterministic findings set."];
  const lightlyInspectedCount = categorySections.filter(
    (section) => section.inspectionStatus === "lightly_inspected"
  ).length;
  const insufficientEvidenceCount = categorySections.filter(
    (section) => section.inspectionStatus === "not_inspected"
  ).length;
  const meaningfullyInspectedCount = categorySections.filter(
    (section) => section.inspectionStatus === "inspected"
  ).length;

  const limitingFrame =
    topPriorities.length === 0
      ? "The current pass did not surface prioritized issues."
      : topPriorities.some((finding) => finding.claimPosture === "confirmed")
        ? `The clearest confirmed issues sit in ${joinLabels(
            dedupeStrings(topPriorities.slice(0, 3).map((finding) => finding.categoryLabel))
          )}.`
        : topPriorities.some((finding) => finding.claimPosture === "observed_pattern")
          ? `The clearest observed patterns sit in ${joinLabels(
              dedupeStrings(topPriorities.slice(0, 3).map((finding) => finding.categoryLabel))
            )}.`
          : `The current pass surfaced mainly directional concerns in ${joinLabels(
              dedupeStrings(topPriorities.slice(0, 3).map((finding) => finding.categoryLabel))
            )}.`;

  return {
    overview:
      `${getScopeSubject(data)} ${describeOverallCondition(data.scores.overall)}. ` +
      limitingFrame,
    whatIsWorking,
    whatIsLimiting,
    inspectionFrame:
      `This report is grounded in deterministic findings only. ` +
      `${meaningfullyInspectedCount} categor${meaningfullyInspectedCount === 1 ? "y was" : "ies were"} meaningfully inspected, ` +
      `${lightlyInspectedCount} ${lightlyInspectedCount === 1 ? "was" : "were"} lightly inspected, and ` +
      `${insufficientEvidenceCount} ${insufficientEvidenceCount === 1 ? "has" : "have"} insufficient evidence.`,
  };
}

function selectActionItems(
  findings: Finding[],
  predicate: (finding: Finding) => boolean,
  limit: number,
  excluded = new Set<string>()
) {
  const selected: string[] = [];

  for (const finding of findings) {
    const recommendation = stripHomepageScopePrefix(finding.recommendation);
    if (!predicate(finding) || excluded.has(recommendation)) {
      continue;
    }

    selected.push(`${CATEGORY_LABELS[finding.category]}: ${recommendation}`);
    excluded.add(recommendation);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function buildStrategicReadout(
  sections: FullReportCategorySection[]
) {
  return STRATEGIC_LENSES.map((lens) => {
    const relevantSections = sections.filter((section) => lens.categories.includes(section.category));
    const findingTitles = relevantSections
      .flatMap((section) => section.findings)
      .slice(0, 2)
      .map((finding) => `"${finding.title}"`);
    const hasPrioritizedFinding = findingTitles.length > 0;
    const hasInsufficientEvidence = relevantSections.every(
      (section) => section.inspectionStatus === "not_inspected"
    );
    const hasLimitedEvidence = relevantSections.some(
      (section) => section.inspectionStatus === "lightly_inspected"
    );

    if (hasPrioritizedFinding) {
      return {
        title: lens.title,
        body:
          `The clearest signal here is ${joinLabels(findingTitles)}. ` +
          `${lens.impactNote}`,
      };
    }

    if (hasInsufficientEvidence) {
      return {
        title: lens.title,
        body: lens.insufficientNote,
      };
    }

    if (hasLimitedEvidence) {
      return {
        title: lens.title,
        body: lens.limitedNote,
      };
    }

    return {
      title: lens.title,
      body: lens.stableNote,
    };
  });
}

function buildExcludedPageNotes(data: ReportData): string[] {
  const excludedPages = data.excludedPages ?? [];
  if (excludedPages.length === 0) return [];

  const notes: string[] = [
    `${excludedPages.length} page${excludedPages.length !== 1 ? "s were" : " was"} excluded from scoring because their findings did not pass page-type review. Accepted findings come from homepage, contact, and approved secondary evidence only. Rejected page findings were not used in scoring or report conclusions.`,
  ];

  for (const page of excludedPages) {
    const reason = page.escalationReason ? ` Reason: ${page.escalationReason}.` : "";
    notes.push(`Excluded (${page.pageState}): ${page.pageType} — ${page.url}.${reason}`);
  }

  return notes;
}

export function buildFullReportData(data: ReportData): FullReportData {
  const topPriorities = data.topPriorities.map(buildNarrativeFinding);
  const topPriorityGroups = groupFindingsByClaimPosture(topPriorities);
  const categorySections = data.categoryReviews.map((review) => {
    const findings = review.findings.map(buildNarrativeFinding);

    return {
      category: review.category,
      label: CATEGORY_LABELS[review.category],
      score: review.score,
      inspectionStatus: review.inspectionStatus,
      inspectionLabel: getInspectionLabel(review),
      inspectionNote: getInspectionNote(review),
      interpretation: buildCategoryInterpretation(review, findings),
      recommendations: dedupeStrings(findings.map((finding) => finding.nextStep)).slice(0, 3),
      findings,
      findingGroups: groupFindingsByClaimPosture(findings),
    };
  });
  const inspectedCleanCategories = categorySections
    .filter((section) => section.inspectionLabel === "No material issue surfaced")
    .map((section) => section.label);
  const lightlyInspectedCategories = categorySections
    .filter((section) => section.inspectionStatus === "lightly_inspected")
    .map((section) => section.label);
  const insufficientEvidenceCategories = categorySections
    .filter((section) => section.inspectionStatus === "not_inspected")
    .map((section) => section.label);
  const evidenceCounts = data.findings.reduce<Record<EvidenceLabel, number>>(
    (acc, finding) => {
      acc[finding.evidenceLevel] += 1;
      return acc;
    },
    { Measured: 0, Observed: 0, Inferred: 0 }
  );
  const severityCounts = data.findings.reduce<Record<FindingSeverity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  );

  const usedRecommendations = new Set<string>();
  const quickWins = selectActionItems(
    data.findings,
    (finding) =>
      finding.evidenceLevel === "Measured" ||
      finding.category === "technical_seo" ||
      finding.category === "accessibility",
    3,
    usedRecommendations
  );
  const mediumPriority = selectActionItems(
    data.findings,
    (finding) =>
      (finding.severity === "high" || finding.severity === "medium") &&
      finding.category !== "messaging_content" &&
      finding.category !== "ux_ui",
    3,
    usedRecommendations
  );
  const strategic = selectActionItems(
    data.findings,
    (finding) =>
      finding.category === "messaging_content" ||
      finding.category === "conversion" ||
      finding.category === "trust_signals" ||
      finding.category === "ux_ui",
    3,
    usedRecommendations
  );

  return {
    auditRunId: data.auditRunId,
    domain: data.domain,
    executiveSummary: buildExecutiveSummary(data, topPriorities, categorySections),
    topPriorities,
    topPriorityGroups,
    scoreSummary: {
      overall: data.scores.overall,
      inspectedCleanCategories,
      lightlyInspectedCategories,
      insufficientEvidenceCategories,
    },
    categorySections,
    strategicReadout: buildStrategicReadout(categorySections),
    nextActions: {
      quickWins:
        quickWins.length > 0
          ? quickWins
          : ["No additional low-complexity wins stood out beyond the prioritized issues already listed above."],
      mediumPriority:
        mediumPriority.length > 0
          ? mediumPriority
          : ["No additional medium-priority items stood out beyond the strongest issues already listed."],
      strategic:
        strategic.length > 0
          ? strategic
          : ["No deeper strategic improvements surfaced beyond the prioritized findings already listed."],
    },
    appendix: {
      scopeNote: buildScopeNote(data),
      evidenceCounts,
      severityCounts,
      inspectionNotes: [
        `No material issue surfaced: ${inspectedCleanCategories.length > 0 ? joinLabels(inspectedCleanCategories) : "none"}.`,
        `Lightly inspected: ${lightlyInspectedCategories.length > 0 ? joinLabels(lightlyInspectedCategories) : "none"}.`,
        `Not fully assessed / insufficient evidence: ${insufficientEvidenceCategories.length > 0 ? joinLabels(insufficientEvidenceCategories) : "none"}.`,
      ],
      excludedPageNotes: buildExcludedPageNotes(data),
    },
  };
}
