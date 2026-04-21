import { describe, it, expect } from "vitest";
import {
  ALL_FINDING_CATEGORIES,
  CATEGORY_EXPECTED_KEYS,
  scoreAudit,
  scoreAuditByCategory,
} from "@/server/scoring/score-audit";

describe("scoreAudit", () => {
  it("does not award a perfect score when no findings exist", () => {
    const result = scoreAudit({ auditRunId: "a", rubricId: "r", findings: [] });
    expect(result.totalScore).toBe(95);
  });

  it("penalizes high-confidence measured findings more than before", () => {
    const result = scoreAudit({
      auditRunId: "a",
      rubricId: "r",
      findings: [{ id: "1", severity: "critical", confidence: "high", evidenceLevel: "Measured" }],
    });
    expect(result.totalScore).toBe(77);
  });

  it("penalizes low-confidence inferred findings less aggressively", () => {
    const result = scoreAudit({
      auditRunId: "a",
      rubricId: "r",
      findings: [{ id: "1", severity: "high", confidence: "low", evidenceLevel: "Inferred" }],
    });
    expect(result.totalScore).toBe(90);
  });

  it("clamps to 0 on extreme penalty", () => {
    const findings = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      severity: "critical" as const,
      confidence: "high" as const,
      evidenceLevel: "Measured" as const,
    }));
    const result = scoreAudit({ auditRunId: "a", rubricId: "r", findings });
    expect(result.totalScore).toBe(0);
  });
});

describe("scoreAuditByCategory", () => {
  it("returns strong but non-perfect inspected scores when no issues are found", () => {
    const result = scoreAuditByCategory([]);
    expect(result.overall).toBe(95);
    expect(result.byCategory.technical_seo).toBe(95);
    expect(result.byCategory.accessibility).toBe(95);
    expect(result.byCategory.ux_ui).toBe(95);
  });

  it("penalizes only the affected inspected category", () => {
    const result = scoreAuditByCategory([
      {
        id: "1",
        severity: "high",
        category: "technical_seo",
        confidence: "high",
        evidenceLevel: "Measured",
      },
    ]);
    expect(result.overall).toBe(94);
    expect(result.byCategory.technical_seo).toBe(83);
    expect(result.byCategory.accessibility).toBe(95);
  });

  it("distinguishes lightly inspected categories from fully inspected ones", () => {
    const result = scoreAuditByCategory([], {
      inspectionKeysByCategory: {
        technical_seo: ["title", "meta_description"],
        accessibility: CATEGORY_EXPECTED_KEYS.accessibility,
      },
    });

    expect(result.byCategory.technical_seo).toBeLessThan(result.byCategory.accessibility);
    expect(result.inspectionSummaryByCategory.technical_seo.status).toBe("lightly_inspected");
    expect(result.inspectionSummaryByCategory.accessibility.status).toBe("inspected");
  });

  it("marks categories with no meaningful evidence as not inspected", () => {
    const result = scoreAuditByCategory([], {
      inspectionKeysByCategory: {
        technical_seo: ["title"],
      },
    });

    expect(result.byCategory.performance).toBe(0);
    expect(result.inspectedCategories).toContain("technical_seo");
    expect(result.inspectedCategories).not.toContain("performance");
    expect(result.inspectionSummaryByCategory.performance.status).toBe("not_inspected");
    expect(result.inspectionSummaryByCategory.ux_ui.status).toBe("not_inspected");
  });

  it("weights confidence and evidence strength inside the same category", () => {
    const highConfidence = scoreAuditByCategory(
      [
        {
          id: "1",
          severity: "medium",
          category: "conversion",
          confidence: "high",
          evidenceLevel: "Measured",
        },
      ],
      {
        inspectionKeysByCategory: {
          conversion: CATEGORY_EXPECTED_KEYS.conversion,
        },
      }
    );

    const lowConfidence = scoreAuditByCategory(
      [
        {
          id: "1",
          severity: "medium",
          category: "conversion",
          confidence: "low",
          evidenceLevel: "Inferred",
        },
      ],
      {
        inspectionKeysByCategory: {
          conversion: CATEGORY_EXPECTED_KEYS.conversion,
        },
      }
    );

    expect(highConfidence.byCategory.conversion).toBeLessThan(lowConfidence.byCategory.conversion);
  });

  it("covers all 8 expected categories", () => {
    expect(ALL_FINDING_CATEGORIES).toHaveLength(8);
    expect(ALL_FINDING_CATEGORIES).toContain("performance");
    expect(ALL_FINDING_CATEGORIES).toContain("mobile_experience");
  });
});
