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
    evidenceRef: { pageUrl: "https://example.com/", pageType: "homepage" },
    recommendation: "Add a title.",
    ...overrides,
  };
}

describe("deduplicateFindings", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateFindings([])).toEqual([]);
  });

  it("passes through single finding unchanged", () => {
    const f = makeFinding();
    const result = deduplicateFindings([f]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Missing page title");
  });

  it("deduplicates identical title+category across two pages", () => {
    const f1 = makeFinding({ pageSnapshotId: "snap-1", evidenceRef: { pageUrl: "https://example.com/", pageType: "homepage" } });
    const f2 = makeFinding({ pageSnapshotId: "snap-2", evidenceRef: { pageUrl: "https://example.com/about", pageType: "about" } });

    const result = deduplicateFindings([f1, f2]);
    expect(result).toHaveLength(1);
  });

  it("merges pageUrls on the first occurrence's evidenceRef", () => {
    const f1 = makeFinding({ evidenceRef: { pageUrl: "https://example.com/", pageType: "homepage" } });
    const f2 = makeFinding({ pageSnapshotId: "snap-2", evidenceRef: { pageUrl: "https://example.com/about", pageType: "about" } });

    const result = deduplicateFindings([f1, f2]);
    const ref = result[0].evidenceRef as Record<string, unknown>;
    expect(Array.isArray(ref.pageUrls)).toBe(true);
    expect((ref.pageUrls as string[]).length).toBe(2);
    expect(ref.pageCount).toBe(2);
  });

  it("does not add duplicate URLs to pageUrls", () => {
    const url = "https://example.com/";
    const f1 = makeFinding({ evidenceRef: { pageUrl: url } });
    const f2 = makeFinding({ pageSnapshotId: "snap-2", evidenceRef: { pageUrl: url } });

    const result = deduplicateFindings([f1, f2]);
    expect(result).toHaveLength(1);
    const ref = result[0].evidenceRef as Record<string, unknown>;
    // Same URL — pageUrls should not grow
    expect(Array.isArray(ref.pageUrls) ? (ref.pageUrls as string[]).length : 1).toBeLessThanOrEqual(1);
  });

  it("keeps findings with different titles separate", () => {
    const f1 = makeFinding({ title: "Missing page title" });
    const f2 = makeFinding({ title: "Missing meta description", category: "technical_seo" });

    const result = deduplicateFindings([f1, f2]);
    expect(result).toHaveLength(2);
  });

  it("keeps findings with different categories separate even with same title", () => {
    const f1 = makeFinding({ category: "technical_seo", title: "No H1 heading detected" });
    const f2 = makeFinding({ category: "accessibility", title: "No H1 heading detected" });

    const result = deduplicateFindings([f1, f2]);
    expect(result).toHaveLength(2);
  });

  it("strips homepage-only prefix before fingerprinting", () => {
    const f1 = makeFinding({ title: "Missing page title" });
    const f2 = makeFinding({
      pageSnapshotId: "snap-2",
      title: "Homepage-only audit: Missing page title",
      evidenceRef: { pageUrl: "https://example.com/about" },
    });

    const result = deduplicateFindings([f1, f2]);
    expect(result).toHaveLength(1);
  });

  it("deduplicates five identical findings down to one", () => {
    const findings = Array.from({ length: 5 }, (_, i) =>
      makeFinding({
        pageSnapshotId: `snap-${i}`,
        evidenceRef: { pageUrl: `https://example.com/page-${i}` },
      })
    );

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    const ref = result[0].evidenceRef as Record<string, unknown>;
    expect((ref.pageUrls as string[]).length).toBe(5);
    expect(ref.pageCount).toBe(5);
  });
});
