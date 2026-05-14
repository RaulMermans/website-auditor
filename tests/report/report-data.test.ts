import { describe, expect, it, vi } from "vitest";
import {
  buildCategoryReviews,
  type ReportData,
  type ReportRepository,
} from "@/db/report";
import {
  CATEGORY_EXPECTED_KEYS,
  scoreAuditByCategory,
} from "@/server/scoring/score-audit";

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
  const scores = scoreAuditByCategory(findings, {
    inspectionKeysByCategory: {
      technical_seo: CATEGORY_EXPECTED_KEYS.technical_seo,
      accessibility: CATEGORY_EXPECTED_KEYS.accessibility,
      conversion: ["cta_present", "cta_inventory"],
    },
  });

  return {
    auditRunId: "run-1",
    domain: "example.com",
    auditRun: makeAuditRun(),
    findings,
    topPriorities: findings,
    scores,
    categoryReviews: buildCategoryReviews(findings, scores),
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
    expect(data.scores.overall).toBe(72);
  });

  it("category score reflects findings in that category only", () => {
    const data = makeReportData();
    expect(data.scores.byCategory.technical_seo).toBe(80);
    expect(data.scores.byCategory.accessibility).toBe(92);
    expect(data.scores.byCategory.conversion).toBeLessThan(92);
  });

  it("scores are re-computable deterministically from findings", () => {
    const data = makeReportData();
    const recomputed = scoreAuditByCategory(data.findings, {
      inspectionKeysByCategory: {
        technical_seo: CATEGORY_EXPECTED_KEYS.technical_seo,
        accessibility: CATEGORY_EXPECTED_KEYS.accessibility,
        conversion: ["cta_present", "cta_inventory"],
      },
    });
    expect(recomputed.overall).toBe(data.scores.overall);
    expect(recomputed.byCategory).toEqual(data.scores.byCategory);
  });
});

describe("report category review semantics", () => {
  it("distinguishes inspected clean, lightly inspected, and insufficient-evidence states", () => {
    const scores = scoreAuditByCategory(
      [
        {
          id: "f1",
          severity: "high",
          category: "technical_seo",
          confidence: "high",
          evidenceLevel: "Measured",
        },
      ],
      {
        inspectionKeysByCategory: {
          technical_seo: CATEGORY_EXPECTED_KEYS.technical_seo,
          accessibility: CATEGORY_EXPECTED_KEYS.accessibility,
          conversion: ["cta_present", "cta_inventory"],
        },
      }
    );

    const reviews = buildCategoryReviews(makeReportData().findings, scores);

    expect(reviews.find((review) => review.category === "technical_seo")?.reviewState).toBe(
      "inspected_with_findings"
    );
    expect(reviews.find((review) => review.category === "accessibility")?.reviewState).toBe(
      "inspected_clean"
    );
    expect(reviews.find((review) => review.category === "conversion")?.reviewState).toBe(
      "lightly_inspected"
    );
    expect(reviews.find((review) => review.category === "ux_ui")?.reviewState).toBe(
      "insufficient_evidence"
    );
  });

  it("suppresses confident healthy scores for homepage-failed secondary-static coverage", () => {
    const scores = scoreAuditByCategory([], {
      inspectionKeysByCategory: {
        messaging_content: CATEGORY_EXPECTED_KEYS.messaging_content,
        conversion: CATEGORY_EXPECTED_KEYS.conversion,
        trust_signals: CATEGORY_EXPECTED_KEYS.trust_signals,
        ux_ui: CATEGORY_EXPECTED_KEYS.ux_ui,
        mobile_experience: CATEGORY_EXPECTED_KEYS.mobile_experience,
      },
      captureFidelity: "secondary_static",
    });

    const reviews = buildCategoryReviews([], scores, {
      captureFidelity: {
        acceptedPageCount: 3,
        browserPageCount: 0,
        staticPageCount: 0,
        fallbackStaticPageCount: 0,
        secondaryStaticPageCount: 3,
        screenshotPageCount: 0,
        hasBrowserEvidence: false,
        primaryFidelity: "secondary_static",
      },
      acceptedPages: [
        { url: "https://example.com/contact", pageType: "contact", pageState: "accepted" },
        { url: "https://example.com/blog", pageType: "content", pageState: "accepted" },
      ],
      excludedPages: [
        {
          url: "https://example.com/",
          pageType: "homepage",
          pageState: "failed",
          escalationReason: "homepage capture was blocked",
        },
      ],
    });

    for (const category of ["messaging_content", "conversion", "trust_signals"] as const) {
      const review = reviews.find((item) => item.category === category);
      expect(review?.score).toBeNull();
      expect(review?.reviewState).toBe("limited_coverage");
      expect(review?.headline).toBe("Limited secondary-static coverage");
      expect(review?.summary).toContain("inspected secondary-static signals");
    }

    for (const category of ["ux_ui", "mobile_experience"] as const) {
      const review = reviews.find((item) => item.category === category);
      expect(review?.score).toBeNull();
      expect(review?.reviewState).toBe("insufficient_evidence");
      expect(review?.summary).toContain("no browser or screenshot evidence");
    }
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
