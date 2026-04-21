import { describe, it, expect } from "vitest";
import { scoreAudit, scoreAuditByCategory, ALL_FINDING_CATEGORIES } from "@/server/scoring/score-audit";

describe("scoreAudit", () => {
  it("returns 100 with no findings", () => {
    const result = scoreAudit({ auditRunId: "a", rubricId: "r", findings: [] });
    expect(result.totalScore).toBe(100);
  });

  it("penalizes critical findings by 20", () => {
    const result = scoreAudit({
      auditRunId: "a",
      rubricId: "r",
      findings: [{ id: "1", severity: "critical" }],
    });
    expect(result.totalScore).toBe(80);
  });

  it("clamps to 0 on extreme penalty", () => {
    const findings = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      severity: "critical" as const,
    }));
    const result = scoreAudit({ auditRunId: "a", rubricId: "r", findings });
    expect(result.totalScore).toBe(0);
  });
});

describe("scoreAuditByCategory", () => {
  it("returns 100 overall and for all categories with no findings", () => {
    const result = scoreAuditByCategory([]);
    expect(result.overall).toBe(100);
    for (const cat of ALL_FINDING_CATEGORIES) {
      expect(result.byCategory[cat]).toBe(100);
    }
  });

  it("penalizes the correct category only", () => {
    const result = scoreAuditByCategory([
      { id: "1", severity: "high", category: "technical_seo" },
    ]);
    expect(result.overall).toBe(90);
    expect(result.byCategory.technical_seo).toBe(90);
    expect(result.byCategory.accessibility).toBe(100);
    expect(result.byCategory.performance).toBe(100);
  });

  it("penalizes multiple categories independently", () => {
    const result = scoreAuditByCategory([
      { id: "1", severity: "high", category: "technical_seo" },
      { id: "2", severity: "medium", category: "accessibility" },
    ]);
    expect(result.overall).toBe(85); // 10 + 5 = 15 penalty
    expect(result.byCategory.technical_seo).toBe(90);
    expect(result.byCategory.accessibility).toBe(95);
    expect(result.byCategory.conversion).toBe(100);
  });

  it("clamps category score to 0", () => {
    const findings = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      severity: "critical" as const,
      category: "ux_ui" as const,
    }));
    const result = scoreAuditByCategory(findings);
    expect(result.byCategory.ux_ui).toBe(0);
    expect(result.byCategory.accessibility).toBe(100);
  });

  it("produces stable output for the same finding set", () => {
    const findings = [
      { id: "1", severity: "medium" as const, category: "accessibility" as const },
      { id: "2", severity: "high" as const, category: "technical_seo" as const },
    ];
    expect(scoreAuditByCategory(findings)).toEqual(scoreAuditByCategory(findings));
  });

  it("covers all 8 expected categories", () => {
    expect(ALL_FINDING_CATEGORIES).toHaveLength(8);
    expect(ALL_FINDING_CATEGORIES).toContain("performance");
    expect(ALL_FINDING_CATEGORIES).toContain("mobile_experience");
  });

  it("defaults inspectedCategories to all categories when not provided", () => {
    const result = scoreAuditByCategory([]);
    const inspected = result.inspectedCategories ?? ALL_FINDING_CATEGORIES;
    expect(inspected).toHaveLength(ALL_FINDING_CATEGORIES.length);
  });

  it("returns only the provided inspectedCategories", () => {
    const inspected: typeof ALL_FINDING_CATEGORIES = ["technical_seo", "accessibility"];
    const result = scoreAuditByCategory([], inspected);
    expect(result.inspectedCategories).toEqual(inspected);
  });

  it("reports uninspected category as 100 in byCategory but exposes it via inspectedCategories", () => {
    const inspected: typeof ALL_FINDING_CATEGORIES = ["technical_seo"];
    const result = scoreAuditByCategory(
      [{ id: "1", severity: "high", category: "technical_seo" }],
      inspected
    );
    // technical_seo penalized
    expect(result.byCategory.technical_seo).toBe(90);
    // performance not inspected — byCategory still shows 100 (penalty model)
    expect(result.byCategory.performance).toBe(100);
    // inspectedCategories reflects what was passed
    expect(result.inspectedCategories).toBeDefined();
    expect(result.inspectedCategories).not.toContain("performance");
    expect(result.inspectedCategories).toContain("technical_seo");
  });
});
