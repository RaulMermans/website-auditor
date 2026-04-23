import { describe, expect, it } from "vitest";
import {
  getPriorityScore,
  prioritizeFindings,
  selectTopPriorityFindings,
} from "@/server/audits/prioritize-findings";
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
        title: "Primary next step is not yet clear on this page",
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
        title: "Script footprint is heavier than expected",
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

  it("favors homepage clarity and conversion issues over lower-impact supporting issues", () => {
    const homepageConversion = makeFinding({
      id: "homepage-conversion",
      category: "conversion",
      title: "Primary action is not clearly distinguished from secondary actions",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceRef: {
        issueType: "competing_cta_hierarchy",
        businessImpact: "high",
        pageType: "homepage",
        pageCount: 1,
        evidenceKeys: ["cta_inventory", "conversion_path"],
      },
    });
    const homepageMessaging = makeFinding({
      id: "homepage-messaging",
      category: "messaging_content",
      title: "Homepage opening message stays broad above the fold",
      severity: "high",
      confidence: "medium",
      evidenceLevel: "Observed",
      evidenceRef: {
        issueType: "weak_value_proposition",
        businessImpact: "high",
        pageType: "homepage",
        pageCount: 1,
        evidenceKeys: ["messaging_quality", "messaging_alignment"],
      },
    });
    const technicalHygiene = makeFinding({
      id: "technical",
      category: "technical_seo",
      title: "Missing meta description",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceRef: {
        issueType: "missing_meta_description",
        businessImpact: "medium",
        pageType: "blog_article",
        pageCount: 3,
        evidenceKeys: ["meta_description"],
      },
    });

    expect(
      prioritizeFindings([technicalHygiene, homepageConversion, homepageMessaging]).map(
        (finding) => finding.id
      )
    ).toEqual(["homepage-conversion", "homepage-messaging", "technical"]);
  });

  it("selects a more distinct top-priority shortlist instead of stacking the same theme", () => {
    const findings = [
      makeFinding({
        id: "conv-1",
        category: "conversion",
        title: "Primary action is not clearly distinguished from secondary actions",
        severity: "high",
        evidenceRef: {
          issueType: "competing_cta_hierarchy",
          businessImpact: "high",
          pageType: "homepage",
          pageCount: 1,
          evidenceKeys: ["cta_inventory", "conversion_path"],
        },
      }),
      makeFinding({
        id: "conv-2",
        category: "conversion",
        title: "Too many calls to action compete for the same attention",
        severity: "medium",
        evidenceRef: {
          issueType: "cta_overload",
          businessImpact: "high",
          pageType: "homepage",
          pageCount: 1,
          evidenceKeys: ["cta_inventory", "conversion_path"],
        },
      }),
      makeFinding({
        id: "trust",
        category: "trust_signals",
        title: "Trust layer is thin on a key decision page",
        severity: "medium",
        evidenceRef: {
          issueType: "low_trust_signal_density",
          businessImpact: "high",
          pageType: "homepage",
          pageCount: 1,
          evidenceKeys: ["trust_signals", "contact_reassurance"],
        },
      }),
      makeFinding({
        id: "message",
        category: "messaging_content",
        title: "Homepage opening message stays broad above the fold",
        severity: "medium",
        evidenceRef: {
          issueType: "weak_value_proposition",
          businessImpact: "high",
          pageType: "homepage",
          pageCount: 1,
          evidenceKeys: ["messaging_quality", "messaging_alignment"],
        },
      }),
    ];

    const shortlist = selectTopPriorityFindings(findings, 3);
    expect(shortlist.map((finding) => finding.id)).toEqual(["conv-1", "message", "trust"]);
  });
});
