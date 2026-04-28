import { describe, expect, it } from "vitest";
import { buildCategoryReviews, type ReportData } from "@/db/report";
import { buildFullReportData } from "@/server/audits/build-full-report";
import {
  CATEGORY_EXPECTED_KEYS,
  scoreAuditByCategory,
} from "@/server/scoring/score-audit";

const now = new Date("2026-04-21T09:00:00.000Z");

function makeReportData(overrides: Partial<ReportData> = {}): ReportData {
  const findings: ReportData["findings"] = [
    {
      id: "f-message",
      auditRunId: "run-1",
      pageSnapshotId: "s-home",
      category: "messaging_content",
      title: "Homepage opening message stays broad above the fold",
      description:
        "The homepage hero copy stays broad and only loosely aligns with the title/meta language in the captured page.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceRef: {
        pageUrl: "https://example.com/",
        pageType: "homepage",
        pageCount: 1,
        evidenceKeys: ["messaging_quality", "messaging_alignment"],
      },
      recommendation:
        "Rewrite the hero so the first screen names the audience, the offer, and the practical outcome before supporting sections begin.",
      createdAt: now,
    },
    {
      id: "f-seo",
      auditRunId: "run-1",
      pageSnapshotId: "s-home",
      category: "technical_seo",
      title: "Missing page title",
      description:
        "The captured HTML does not include a non-empty <title> tag, so the page is missing one of its core search and browser labels.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceRef: {
        pageUrl: "https://example.com/",
        pageType: "homepage",
        pageCount: 1,
        evidenceKeys: ["title"],
      },
      recommendation:
        "Write a unique <title> tag that states the page topic clearly and distinguishes it from the rest of the site.",
      createdAt: now,
    },
    {
      id: "f-conversion",
      auditRunId: "run-1",
      pageSnapshotId: "s-home",
      category: "conversion",
      title: "Primary next step is not yet clear on this page",
      description:
        "The captured DOM did not surface a standard CTA/button pattern or form. That suggests the page may not be giving visitors an obvious next step, although this remains a directional judgment rather than a measured conversion benchmark.",
      severity: "medium",
      confidence: "medium",
      evidenceLevel: "Inferred",
      evidenceRef: {
        pageUrl: "https://example.com/",
        pageType: "homepage",
        pageCount: 1,
        evidenceKeys: ["cta_present", "form_present", "button_count"],
      },
      recommendation:
        "Add one obvious next-step action for this page, such as a contact CTA, booking route, or short request form.",
      createdAt: now,
    },
  ];

  const scores = scoreAuditByCategory(findings, {
    inspectionKeysByCategory: {
      technical_seo: CATEGORY_EXPECTED_KEYS.technical_seo,
      accessibility: CATEGORY_EXPECTED_KEYS.accessibility,
      messaging_content: CATEGORY_EXPECTED_KEYS.messaging_content,
      conversion: ["cta_present", "form_present"],
    },
  });

  return {
    auditRunId: "run-1",
    domain: "example.com",
    auditRun: {
      id: "run-1",
      projectId: null,
      targetDomainId: "target-1",
      status: "complete",
      homepageOnly: false,
      startedAt: now,
      completedAt: now,
      failureReason: null,
      createdAt: now,
    },
    findings,
    topPriorities: [findings[0]!, findings[1]!, findings[2]!],
    scores,
    categoryReviews: buildCategoryReviews(findings, scores),
    ...overrides,
  };
}

describe("buildFullReportData", () => {
  it("shapes a deterministic full report with required sections", () => {
    const fullReport = buildFullReportData(makeReportData());

    expect(fullReport.executiveSummary.overview).toContain("captured page set");
    expect(fullReport.executiveSummary.whatIsLimiting[0]).toContain("Brand Clarity & Messaging:");
    expect(fullReport.topPriorities).toHaveLength(3);
    expect(fullReport.topPriorityGroups.map((group) => group.label)).toEqual([
      "Confirmed",
      "Observed Pattern",
      "Directional",
    ]);
    expect(fullReport.scoreSummary.lightlyInspectedCategories).toContain("Conversion Path");
    expect(fullReport.scoreSummary.insufficientEvidenceCategories).toContain("Experience Flow");
    expect(fullReport.strategicReadout.map((item) => item.title)).toEqual([
      "Brand Clarity",
      "Conversion Path",
      "Trust & Proof",
      "Experience Flow",
    ]);
    expect(fullReport.nextActions.quickWins[0]).toContain("Technical SEO:");
    expect(fullReport.topPriorities[0]?.evidenceNote).toContain("visible page patterns");
    expect(fullReport.topPriorities[2]?.risk).toContain("directional");
    expect(
      fullReport.categorySections.find((section) => section.category === "conversion")?.findingGroups[0]?.label
    ).toBe("Directional");
  });

  it("keeps full report findings grounded in the underlying deterministic findings", () => {
    const data = makeReportData();
    const fullReport = buildFullReportData(data);
    const inputTitles = data.findings.map((finding) => finding.title).sort();
    const sectionTitles = fullReport.categorySections
      .flatMap((section) => section.findings)
      .map((finding) => finding.title)
      .sort();

    expect(sectionTitles).toEqual(inputTitles);
    expect(fullReport.topPriorities.map((finding) => finding.title)).toEqual(
      data.topPriorities.map((finding) => finding.title)
    );
  });

  it("uses new display labels: Brand Clarity & Messaging and Trust & Proof", () => {
    const fullReport = buildFullReportData(makeReportData());
    const categoryLabels = fullReport.categorySections.map((section) => section.label);

    expect(categoryLabels).toContain("Brand Clarity & Messaging");
    expect(categoryLabels).toContain("Trust & Proof");
    expect(categoryLabels).toContain("Conversion Path");
    expect(categoryLabels).toContain("Experience Flow");
    expect(categoryLabels).not.toContain("Messaging & Content");
    expect(categoryLabels).not.toContain("UX / UI");
    expect(categoryLabels).not.toContain("Trust Signals");
    expect(categoryLabels).not.toContain("Conversion");
  });

  it("preserves homepage-only framing while stripping repetitive homepage prefixes", () => {
    const data = makeReportData({
      auditRun: {
        ...makeReportData().auditRun,
        homepageOnly: true,
      },
      findings: makeReportData().findings.map((finding) => ({
        ...finding,
        title: `Homepage-only audit: ${finding.title}`,
        description: `Homepage-only audit: ${finding.description}`,
        recommendation: `Homepage-only audit: ${finding.recommendation}`,
      })),
      topPriorities: makeReportData().topPriorities.map((finding) => ({
        ...finding,
        title: `Homepage-only audit: ${finding.title}`,
        description: `Homepage-only audit: ${finding.description}`,
        recommendation: `Homepage-only audit: ${finding.recommendation}`,
      })),
    });

    const fullReport = buildFullReportData(data);

    expect(fullReport.appendix.scopeNote).toContain("Homepage-only audit");
    expect(fullReport.topPriorities[0]?.title.startsWith("Homepage-only audit:")).toBe(false);
    expect(fullReport.topPriorities[0]?.summary.startsWith("Homepage-only audit:")).toBe(false);
    expect(fullReport.topPriorities[0]?.nextStep.startsWith("Homepage-only audit:")).toBe(false);
  });
});
