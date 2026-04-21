import type { ReportCategoryReview, ReportData } from "@/db/report";
import type {
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
    "Page weight and structural complexity increase the chance of a slower first impression or delayed interaction.",
  technical_seo:
    "Search engines and browsers receive weaker signals about page purpose, hierarchy, or preferred indexing state.",
  accessibility:
    "Visitors using assistive technology lose context or fallback information that should be available by default.",
  ux_ui:
    "Scanning and decision-making become harder when the layout gives too many elements similar visual weight.",
  messaging_content:
    "Visitors have to work harder to understand the offer, audience, or outcome before they decide whether to continue.",
  conversion:
    "The path from interest to action becomes less obvious or asks for too much commitment too early.",
  trust_signals:
    "The page gives visitors less reassurance at the point where they need confidence to move forward.",
  mobile_experience:
    "Small-screen visitors are more likely to hit density, friction, or long-scroll fatigue before reaching the key action.",
};

const CLEAN_CATEGORY_NOTES: Record<FindingCategory, string> = {
  performance:
    "The deterministic pass did not surface material performance warnings in the inspected signals.",
  technical_seo:
    "Core search-facing hygiene looked stable in the inspected HTML and structural signals.",
  accessibility:
    "The captured accessibility checks did not surface material issues in the current pass.",
  ux_ui:
    "The inspected structural signals did not indicate clear scan-flow or layout hierarchy problems.",
  messaging_content:
    "The inspected messaging signals did not surface a clear clarity or positioning problem in the current pass.",
  conversion:
    "The inspected conversion signals did not reveal a strong next-step or form-friction issue.",
  trust_signals:
    "The inspected trust layer did not surface a material reassurance gap in the current pass.",
  mobile_experience:
    "The inspected mobile-oriented signals did not reveal an obvious small-screen problem in the current pass.",
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
    title: "Messaging Clarity",
    categories: ["messaging_content", "technical_seo"],
    stableNote:
      "The inspected messaging signals read comparatively stable, with no prioritized clarity issues surfaced in the current deterministic pass.",
    limitedNote:
      "Only partial messaging evidence was available here, so narrative judgments should be treated as directional rather than complete.",
    insufficientNote:
      "The current deterministic pass did not inspect messaging deeply enough to make a confident narrative call.",
    impactNote:
      "That weakens how quickly the page explains what it offers and why a visitor should keep going.",
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

export interface FullReportFinding {
  id: string;
  category: FindingCategory;
  categoryLabel: string;
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

function describeOverallCondition(score: number) {
  if (score >= 85) {
    return "shows a relatively disciplined foundation in the inspected areas, with targeted weaknesses rather than broad breakdowns";
  }

  if (score >= 70) {
    return "has a workable foundation, but several issues are still reducing clarity, trust, or efficiency";
  }

  if (score >= 55) {
    return "shows material friction across the inspected areas and would benefit from a focused remediation pass";
  }

  return "shows multiple high-priority issues in the inspected areas and needs a sharper correction pass before it feels consistently credible";
}

function getScopeSubject(data: ReportData) {
  return data.auditRun.homepageOnly ? "The homepage" : "The captured page set";
}

function getInspectionLabel(review: ReportCategoryReview) {
  if (review.reviewState === "insufficient_evidence") {
    return "Insufficient evidence";
  }

  if (review.reviewState === "lightly_inspected") {
    return "Light inspection";
  }

  if (review.reviewState === "inspected_clean") {
    return "Inspected and clean";
  }

  return "Inspected with prioritized findings";
}

function getInspectionNote(review: ReportCategoryReview) {
  if (review.reviewState === "insufficient_evidence") {
    return "This category was not meaningfully covered in the current deterministic pass.";
  }

  return `${review.observedChecks}/${review.expectedChecks} deterministic checks covered in this category.`;
}

function getSeverityRisk(severity: Finding["severity"]) {
  switch (severity) {
    case "critical":
      return "This is a priority correction because it is likely to materially weaken performance on a key page.";
    case "high":
      return "This is likely to suppress clarity, trust, or follow-through until it is corrected.";
    case "medium":
      return "This creates meaningful friction and is worth addressing in the next improvement pass.";
    case "low":
      return "This is secondary to higher-priority issues, but tightening it should improve polish and consistency.";
    case "info":
    default:
      return "This is a lower-stakes issue, but cleaning it up should improve overall execution quality.";
  }
}

function getEvidenceCalibration(finding: Finding) {
  if (finding.evidenceLevel === "Measured") {
    return "Measured directly from the captured page.";
  }

  if (finding.evidenceLevel === "Observed") {
    return "Observed in the captured page structure and content patterns.";
  }

  return "Inference from captured signals rather than a directly measured defect; validate it while implementing the fix.";
}

function buildRiskStatement(finding: Finding) {
  const severityRisk = getSeverityRisk(finding.severity);

  if (finding.evidenceLevel === "Inferred") {
    return `${severityRisk} The risk call here is intentionally cautious because it is inference-backed, not directly measured.`;
  }

  if (finding.evidenceLevel === "Observed") {
    return `${severityRisk} The underlying pattern is visible in the captured experience, even if downstream impact was not directly measured here.`;
  }

  return `${severityRisk} The underlying issue is directly measurable in the captured page.`;
}

function buildNarrativeFinding(finding: Finding): FullReportFinding {
  return {
    id: finding.id,
    category: finding.category,
    categoryLabel: CATEGORY_LABELS[finding.category],
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
      ? "This category surfaced credible issues, but the inspection depth was partial. The current findings are directionally useful; the absence of additional issues is not a clean bill of health."
      : "Only limited checks ran here. No issues surfaced, but the evidence is too thin to call the category clean.";
  }

  if (review.reviewState === "inspected_clean") {
    return CLEAN_CATEGORY_NOTES[review.category];
  }

  const leadFinding = narrativeFindings[0];
  return leadFinding
    ? `${CATEGORY_LABELS[review.category]} is one of the clearer pressure points in this audit. The lead issue is "${leadFinding.title}", and the inspection depth is strong enough to treat the surfaced problems as credible.`
    : `${CATEGORY_LABELS[review.category]} shows credible pressure in the current deterministic pass.`;
}

function buildExecutiveSummary(
  data: ReportData,
  topPriorities: FullReportFinding[],
  categorySections: FullReportCategorySection[]
) {
  const inspectedCleanCategories = categorySections
    .filter((section) => section.inspectionLabel === "Inspected and clean")
    .map((section) => section.label);
  const whatIsWorking =
    inspectedCleanCategories.length > 0
      ? [
          `The current deterministic pass did not surface material issues in ${joinLabels(inspectedCleanCategories)}.`,
        ]
      : ["Few inspected categories read as clearly clean yet in the current pass."];
  const whatIsLimiting =
    topPriorities.length > 0
      ? topPriorities.slice(0, 3).map(
          (finding) => `${finding.title}: ${finding.whyItMatters}`
        )
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

  return {
    overview:
      `${getScopeSubject(data)} ${describeOverallCondition(data.scores.overall)}. ` +
      (topPriorities.length > 0
        ? `The strongest constraints currently sit in ${joinLabels(
            dedupeStrings(topPriorities.slice(0, 3).map((finding) => finding.categoryLabel))
          )}.`
        : "The current pass did not surface prioritized issues."),
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
          `The strongest signal here is ${joinLabels(findingTitles)}. ` +
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

export function buildFullReportData(data: ReportData): FullReportData {
  const topPriorities = data.topPriorities.map(buildNarrativeFinding);
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
    };
  });
  const inspectedCleanCategories = categorySections
    .filter((section) => section.inspectionLabel === "Inspected and clean")
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
          : ["No immediate deterministic quick wins were surfaced beyond the issues already listed above."],
      mediumPriority:
        mediumPriority.length > 0
          ? mediumPriority
          : ["No additional medium-priority items stood out beyond the strongest issues already listed."],
      strategic:
        strategic.length > 0
          ? strategic
          : ["No deeper strategic improvements were surfaced beyond the prioritized findings already listed."],
    },
    appendix: {
      scopeNote: data.auditRun.homepageOnly
        ? "Homepage-only audit. Conclusions apply to the captured homepage snapshot and should not be generalized to the full site."
        : "Multi-page audit. Conclusions apply only to the captured page set included in this run.",
      evidenceCounts,
      severityCounts,
      inspectionNotes: [
        `Inspected and clean: ${inspectedCleanCategories.length > 0 ? joinLabels(inspectedCleanCategories) : "none"}.`,
        `Lightly inspected: ${lightlyInspectedCategories.length > 0 ? joinLabels(lightlyInspectedCategories) : "none"}.`,
        `Insufficient evidence: ${insufficientEvidenceCategories.length > 0 ? joinLabels(insufficientEvidenceCategories) : "none"}.`,
      ],
    },
  };
}
