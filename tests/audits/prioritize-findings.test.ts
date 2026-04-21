import { describe, expect, it } from "vitest";
import { getPriorityScore, prioritizeFindings } from "@/server/audits/prioritize-findings";
import type { Finding } from "@/lib/types";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    auditRunId: "run-1",
    pageSnapshotId: "snap-1",
    category: "technical_seo",
    title: "Missing meta description",
    description: "No meta description found.",
    severity: "medium",
    confidence: "medium",
    evidenceLevel: "Measured",
    evidenceRef: {
      issueType: "missing_meta_description",
      businessImpact: "medium",
      pageUrl: "https://example.com/",
      pageCount: 1,
    },
    recommendation: "Add a meta description.",
    createdAt: new Date("2026-04-21T10:00:00.000Z"),
    ...overrides,
  };
}

describe("prioritizeFindings", () => {
  it("ranks higher-severity, higher-impact findings first", () => {
    const findings = prioritizeFindings([
      makeFinding({
        id: "1",
        category: "conversion",
        title: "Weak next-step conversion path on captured page",
        severity: "high",
        confidence: "high",
        evidenceLevel: "Inferred",
        evidenceRef: { issueType: "weak_next_step_conversion_path", businessImpact: "high", pageCount: 1 },
      }),
      makeFinding({
        id: "2",
        category: "technical_seo",
        title: "Missing meta description",
        severity: "medium",
        confidence: "high",
        evidenceLevel: "Measured",
        evidenceRef: { issueType: "missing_meta_description", businessImpact: "medium", pageCount: 1 },
      }),
      makeFinding({
        id: "3",
        category: "performance",
        title: "Heavy script loading may delay page responsiveness",
        severity: "low",
        confidence: "medium",
        evidenceLevel: "Measured",
        evidenceRef: { issueType: "heavy_script_loading", businessImpact: "medium", pageCount: 3 },
      }),
    ]);

    expect(findings.map((finding) => finding.id)).toEqual(["1", "2", "3"]);
  });

  it("uses page spread as a tiebreaker for the same root severity", () => {
    const widespread = makeFinding({
      id: "widespread",
      evidenceRef: { issueType: "missing_meta_description", businessImpact: "medium", pageCount: 4 },
    });
    const isolated = makeFinding({
      id: "isolated",
      evidenceRef: { issueType: "missing_meta_description", businessImpact: "medium", pageCount: 1 },
    });

    expect(getPriorityScore(widespread)).toBeGreaterThan(getPriorityScore(isolated));
    expect(prioritizeFindings([isolated, widespread]).map((finding) => finding.id)).toEqual([
      "widespread",
      "isolated",
    ]);
  });

  it("stays stable when scores tie by falling back to deterministic text ordering", () => {
    const findings = prioritizeFindings([
      makeFinding({ id: "b", title: "Zeta priority" }),
      makeFinding({ id: "a", title: "Alpha priority" }),
    ]);

    expect(findings.map((finding) => finding.id)).toEqual(["a", "b"]);
  });
});
