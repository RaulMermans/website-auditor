import { describe, expect, it, vi } from "vitest";
import type { ReportData, ReportRepository } from "@/db/report";
import { scoreAuditByCategory } from "@/server/scoring/score-audit";

const now = new Date("2026-04-19T10:00:00.000Z");

function makeAuditRun(overrides: Partial<ReportData["auditRun"]> = {}): ReportData["auditRun"] {
  return {
    id: "run-1",
    projectId: null,
    targetDomainId: "target-1",
    status: "complete",
    homepageOnly: false,
    startedAt: now,
    completedAt: now,
    failureReason: null,
    createdAt: now,
    ...overrides,
  };
}

function makeReportData(overrides: Partial<ReportData> = {}): ReportData {
  const findings: ReportData["findings"] = [
    {
      id: "f1",
      auditRunId: "run-1",
      pageSnapshotId: "s1",
      category: "technical_seo",
      title: "Missing page title",
      description: "No title tag found.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceRef: { pageUrl: "https://example.com/", scope: "captured_pages" },
      recommendation: "Add a descriptive title tag.",
      createdAt: now,
    },
  ];

  return {
    auditRunId: "run-1",
    domain: "example.com",
    auditRun: makeAuditRun(),
    findings,
    scores: scoreAuditByCategory(findings),
    ...overrides,
  };
}

describe("ReportRepository interface", () => {
  it("returns null for an unknown audit run", async () => {
    const repo: ReportRepository = {
      getReportData: vi.fn().mockResolvedValue(null),
    };
    expect(await repo.getReportData("unknown")).toBeNull();
  });

  it("returns report data when the run exists", async () => {
    const fixture = makeReportData();
    const repo: ReportRepository = {
      getReportData: vi.fn().mockResolvedValue(fixture),
    };
    const result = await repo.getReportData("run-1");
    expect(result).not.toBeNull();
    expect(result!.auditRunId).toBe("run-1");
    expect(result!.domain).toBe("example.com");
    expect(result!.findings).toHaveLength(1);
  });
});

describe("report data scores consistency", () => {
  it("overall score matches findings penalty", () => {
    const data = makeReportData();
    // 1 high finding = 10 penalty → score 90
    expect(data.scores.overall).toBe(90);
  });

  it("category score reflects findings in that category only", () => {
    const data = makeReportData();
    expect(data.scores.byCategory.technical_seo).toBe(90);
    expect(data.scores.byCategory.accessibility).toBe(100);
    expect(data.scores.byCategory.conversion).toBe(100);
  });

  it("scores are re-computable deterministically from findings", () => {
    const data = makeReportData();
    const recomputed = scoreAuditByCategory(data.findings);
    expect(recomputed.overall).toBe(data.scores.overall);
    expect(recomputed.byCategory).toEqual(data.scores.byCategory);
  });
});

describe("homepage-only scope in report data", () => {
  it("homepage-only flag is preserved in audit run", () => {
    const data = makeReportData({
      auditRun: makeAuditRun({ homepageOnly: true }),
    });
    expect(data.auditRun.homepageOnly).toBe(true);
  });

  it("multi-page audit run is not marked homepage-only", () => {
    const data = makeReportData();
    expect(data.auditRun.homepageOnly).toBe(false);
  });
});
