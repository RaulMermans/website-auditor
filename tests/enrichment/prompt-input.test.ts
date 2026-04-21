import { describe, it, expect } from "vitest";
import { buildEnrichmentInput } from "@/server/audits/generate-report-enrichment";
import type { ReportData } from "@/db/report";
import type { Finding, AuditRun } from "@/lib/types";
import { scoreAuditByCategory } from "@/server/scoring/score-audit";

function makeRun(homepageOnly: boolean): AuditRun {
  return {
    id: "run-1",
    targetDomainId: "domain-1",
    status: "complete",
    homepageOnly,
    startedAt: new Date(),
    createdAt: new Date(),
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-1",
    auditRunId: "run-1",
    pageSnapshotId: "snap-1",
    category: "technical_seo",
    title: "Missing meta description",
    description: "No meta description found.",
    severity: "medium",
    confidence: "high",
    evidenceLevel: "Measured",
    evidenceRef: {},
    recommendation: "Add a meta description.",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeReportData(findings: Finding[], homepageOnly = false): ReportData {
  return {
    auditRunId: "run-1",
    domain: "example.com",
    auditRun: makeRun(homepageOnly),
    findings,
    topPriorities: findings.slice(0, 5),
    scores: scoreAuditByCategory(findings),
  };
}

describe("buildEnrichmentInput", () => {
  it("sets domain and scores from report data", () => {
    const input = buildEnrichmentInput(makeReportData([]));
    expect(input.domain).toBe("example.com");
    expect(input.overallScore).toBe(95);
  });

  it("passes homepage_only flag through", () => {
    expect(buildEnrichmentInput(makeReportData([], true)).homepageOnly).toBe(true);
    expect(buildEnrichmentInput(makeReportData([], false)).homepageOnly).toBe(false);
  });

  it("limits findingSummaries to 10 items", () => {
    const findings = Array.from({ length: 15 }, (_, i) =>
      makeFinding({ id: `f-${i}`, title: `Issue ${i}` })
    );
    const input = buildEnrichmentInput({
      ...makeReportData(findings),
      topPriorities: findings,
    });
    expect(input.findingSummaries.length).toBeLessThanOrEqual(10);
  });

  it("uses prioritized findings order from report data", () => {
    const findings = [
      makeFinding({ id: "1", severity: "low" }),
      makeFinding({ id: "2", severity: "critical" }),
      makeFinding({ id: "3", severity: "high" }),
    ];
    const input = buildEnrichmentInput({
      ...makeReportData(findings),
      topPriorities: [findings[1], findings[2], findings[0]],
    });
    expect(input.findingSummaries[0].severity).toBe("critical");
    expect(input.findingSummaries[1].severity).toBe("high");
  });

  it("topRecommendations only includes critical and high findings", () => {
    const findings = [
      makeFinding({ id: "1", severity: "critical", recommendation: "Fix critical" }),
      makeFinding({ id: "2", severity: "high", recommendation: "Fix high" }),
      makeFinding({ id: "3", severity: "medium", recommendation: "Fix medium" }),
    ];
    const input = buildEnrichmentInput(makeReportData(findings));
    expect(input.topRecommendations).toContain("Fix critical");
    expect(input.topRecommendations).toContain("Fix high");
    expect(input.topRecommendations).toContain("Fix medium");
  });

  it("topRecommendations is empty when no critical/high findings", () => {
    const findings = [makeFinding({ severity: "low" }), makeFinding({ severity: "info" })];
    const input = buildEnrichmentInput(makeReportData(findings));
    expect(input.topRecommendations).toHaveLength(0);
  });

  it("includes evidence level in finding summaries", () => {
    const findings = [makeFinding({ evidenceLevel: "Inferred" })];
    const input = buildEnrichmentInput(makeReportData(findings));
    expect(input.findingSummaries[0].evidenceLevel).toBe("Inferred");
  });

  it("returns empty summaries when there are no findings", () => {
    const input = buildEnrichmentInput(makeReportData([]));
    expect(input.findingSummaries).toHaveLength(0);
    expect(input.topRecommendations).toHaveLength(0);
  });
});
