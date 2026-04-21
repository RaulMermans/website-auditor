import { describe, expect, it } from "vitest";
import { deduplicateFindings } from "@/server/audits/deduplicate-findings";
import type { CreateFindingInput } from "@/db/analysis";

function makeFinding(overrides: Partial<CreateFindingInput> = {}): CreateFindingInput {
  return {
    auditRunId: "run-1",
    pageSnapshotId: "snap-1",
    category: "technical_seo",
    title: "Missing page title",
    description: "No title tag.",
    severity: "high",
    confidence: "high",
    evidenceLevel: "Measured",
    evidenceRef: {
      pageUrl: "https://example.com/",
      pageType: "homepage",
      issueType: "missing_title",
      evidenceKeys: ["title"],
      businessImpact: "medium",
    },
    recommendation: "Add a title.",
    ...overrides,
  };
}

describe("deduplicateFindings", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateFindings([])).toEqual([]);
  });

  it("passes through a single finding unchanged", () => {
    const finding = makeFinding();
    const result = deduplicateFindings([finding]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Missing page title");
  });

  it("deduplicates the same issue across multiple pages", () => {
    const result = deduplicateFindings([
      makeFinding(),
      makeFinding({
        pageSnapshotId: "snap-2",
        evidenceRef: {
          pageUrl: "https://example.com/about",
          pageType: "about",
          issueType: "missing_title",
          evidenceKeys: ["title"],
          businessImpact: "medium",
        },
      }),
    ]);

    expect(result).toHaveLength(1);
    const ref = result[0].evidenceRef as Record<string, unknown>;
    expect(ref.pageCount).toBe(2);
    expect(ref.pageUrls).toEqual([
      "https://example.com/",
      "https://example.com/about",
    ]);
    expect(ref.pageTypes).toEqual(["homepage", "about"]);
  });

  it("merges semantic duplicates when titles vary but issueType matches", () => {
    const result = deduplicateFindings([
      makeFinding({ title: "Missing page title" }),
      makeFinding({
        pageSnapshotId: "snap-2",
        title: "Title tag missing on captured page",
        description: "The page is missing a title tag.",
        evidenceRef: {
          pageUrl: "https://example.com/services",
          pageType: "services",
          issueType: "missing_title",
          evidenceKeys: ["title", "heading_structure"],
          businessImpact: "high",
        },
      }),
    ]);

    expect(result).toHaveLength(1);
    const ref = result[0].evidenceRef as Record<string, unknown>;
    expect(ref.evidenceKeys).toEqual(["title", "heading_structure"]);
    expect(ref.businessImpact).toBe("high");
  });

  it("falls back to normalized title fingerprints when issueType is missing", () => {
    const result = deduplicateFindings([
      makeFinding({
        title: "Homepage-only audit: Missing meta description",
        category: "technical_seo",
        evidenceRef: { pageUrl: "https://example.com/" },
      }),
      makeFinding({
        pageSnapshotId: "snap-2",
        title: "Missing meta description",
        category: "technical_seo",
        evidenceRef: { pageUrl: "https://example.com/about" },
      }),
    ]);

    expect(result).toHaveLength(1);
  });

  it("keeps findings with different categories separate even with the same issue type", () => {
    const result = deduplicateFindings([
      makeFinding({ category: "technical_seo", title: "No H1 heading detected", evidenceRef: { issueType: "missing_h1" } }),
      makeFinding({ category: "accessibility", title: "No H1 heading detected", evidenceRef: { issueType: "missing_h1" } }),
    ]);

    expect(result).toHaveLength(2);
  });

  it("keeps the most severe, confident, and strongest-evidence version as representative", () => {
    const result = deduplicateFindings([
      makeFinding({
        title: "Missing page title",
        severity: "low",
        confidence: "low",
        evidenceLevel: "Inferred",
      }),
      makeFinding({
        pageSnapshotId: "snap-2",
        title: "Title tag missing on captured page",
        severity: "high",
        confidence: "high",
        evidenceLevel: "Measured",
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
    });
  });

  it("still merges stronger evaluator output when the same root issue appears on multiple captured pages", () => {
    const result = deduplicateFindings([
      makeFinding({
        category: "messaging_content",
        title: "Homepage value proposition is still too generic above the fold",
        description: "The hero copy stays broad.",
        severity: "high",
        evidenceRef: {
          pageUrl: "https://example.com/",
          pageType: "homepage",
          issueType: "weak_value_proposition",
          evidenceKeys: ["messaging_quality", "messaging_alignment"],
          businessImpact: "high",
        },
      }),
      makeFinding({
        pageSnapshotId: "snap-2",
        category: "messaging_content",
        title: "Homepage value proposition is still too generic above the fold",
        description: "The hero copy stays broad.",
        severity: "medium",
        evidenceRef: {
          pageUrl: "https://example.com/services",
          pageType: "services",
          issueType: "weak_value_proposition",
          evidenceKeys: ["messaging_quality", "messaging_alignment"],
          businessImpact: "high",
        },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("high");
    expect((result[0].evidenceRef as Record<string, unknown>).pageCount).toBe(2);
  });
});
