import { describe, expect, it } from "vitest";
import type { CreateFindingInput, CreatePageEvidenceInput } from "@/db/analysis";
import { reviewPageFindings } from "@/server/audits/review-page-findings";

const SNAPSHOT = {
  id: "snap-1",
  url: "https://example.com/",
  pageType: "homepage" as const,
};

function makeEvidence(overrides: Partial<CreatePageEvidenceInput> = {}): CreatePageEvidenceInput {
  return {
    auditRunId: "run-1",
    pageSnapshotId: SNAPSHOT.id,
    category: "technical_seo",
    key: "title",
    value: { present: false },
    evidenceLevel: "Measured",
    ...overrides,
  };
}

function makeFinding(overrides: Partial<CreateFindingInput> = {}): CreateFindingInput {
  return {
    auditRunId: "run-1",
    pageSnapshotId: SNAPSHOT.id,
    category: "technical_seo",
    title: "Missing page title",
    description: "The captured HTML does not include a non-empty <title> tag.",
    severity: "high",
    confidence: "high",
    evidenceLevel: "Measured",
    evidenceRef: {
      pageUrl: SNAPSHOT.url,
      pageType: SNAPSHOT.pageType,
      issueType: "missing_title",
      evidenceKeys: ["title"],
      businessImpact: "medium",
    },
    recommendation: "Add a title.",
    ...overrides,
  };
}

describe("reviewPageFindings", () => {
  it("accepts evidence-backed findings and assigns calibration fields", () => {
    const result = reviewPageFindings({
      snapshot: SNAPSHOT,
      pageEvidence: [makeEvidence()],
      findings: [makeFinding()],
    });

    expect(result.reviewStatus).toBe("accepted");
    expect(result.evaluatorStatus).toBe("accepted");
    expect(result.retryCount).toBe(0);
    expect(result.escalationReason).toBeNull();
    expect(result.acceptedFindings).toHaveLength(1);
    expect(result.acceptedFindings[0]).toMatchObject({
      claimPosture: "confirmed",
      supportType: "dom",
      evaluatorStatus: "accepted",
    });
  });

  it("downgrades inferred wording and calibration before acceptance", () => {
    const result = reviewPageFindings({
      snapshot: SNAPSHOT,
      pageEvidence: [
        makeEvidence({
          category: "conversion",
          key: "cta_present",
          value: false,
        }),
        makeEvidence({
          category: "conversion",
          key: "form_present",
          value: false,
        }),
        makeEvidence({
          category: "conversion",
          key: "button_count",
          value: 0,
        }),
      ],
      findings: [
        makeFinding({
          category: "conversion",
          title: "Primary next step is not yet clear on this page",
          description:
            "The captured DOM does not surface a standard CTA/button pattern or form. That suggests the page is not giving visitors an obvious next step.",
          severity: "high",
          confidence: "high",
          evidenceLevel: "Inferred",
          evidenceRef: {
            pageUrl: SNAPSHOT.url,
            pageType: SNAPSHOT.pageType,
            issueType: "weak_next_step_conversion_path",
            evidenceKeys: ["cta_present", "form_present", "button_count"],
            businessImpact: "high",
          },
          recommendation: "Add one obvious next-step action.",
        }),
      ],
    });

    expect(result.acceptedFindings).toHaveLength(1);
    expect(result.acceptedFindings[0]).toMatchObject({
      severity: "medium",
      confidence: "medium",
      claimPosture: "directional",
      supportType: "inferred",
      evaluatorStatus: "accepted",
    });
    expect(result.acceptedFindings[0]?.title.toLowerCase()).toContain("may not yet be");
    expect(result.acceptedFindings[0]?.evaluatorNotes).toContain("Evaluator softened directional wording.");
  });

  it("marks findings for review when evidence keys are missing", () => {
    const result = reviewPageFindings({
      snapshot: { ...SNAPSHOT, retryCount: 2 },
      pageEvidence: [makeEvidence()],
      findings: [
        makeFinding({
          category: "trust_signals",
          title: "Trust layer is thin on a key decision page",
          description: "The captured page shows at most one trust indicator.",
          severity: "medium",
          confidence: "medium",
          evidenceLevel: "Observed",
          evidenceRef: {
            pageUrl: SNAPSHOT.url,
            pageType: SNAPSHOT.pageType,
            issueType: "low_trust_signal_density",
            evidenceKeys: ["trust_signals", "contact_reassurance"],
            businessImpact: "high",
          },
          recommendation: "Build a fuller trust layer.",
        }),
      ],
    });

    expect(result.reviewStatus).toBe("needs_review");
    expect(result.retryCount).toBe(3);
    expect(result.acceptedFindings).toHaveLength(0);
    expect(result.findings[0]).toMatchObject({
      evaluatorStatus: "needs_review",
    });
    expect(result.findings[0]?.evaluatorNotes).toContain("evidence keys were missing");
  });

  it("rejects duplicate and contradictory findings before acceptance", () => {
    const result = reviewPageFindings({
      snapshot: { ...SNAPSHOT, retryCount: 1 },
      pageEvidence: [
        makeEvidence(),
        makeEvidence({ key: "h1_count", value: 2 }),
        makeEvidence({ key: "heading_structure", value: { hints: [] } }),
      ],
      findings: [
        makeFinding(),
        makeFinding({
          severity: "low",
          confidence: "low",
        }),
        makeFinding({
          title: "Multiple H1 headings detected",
          description: "More than one H1 heading was found.",
          severity: "high",
          confidence: "high",
          evidenceLevel: "Measured",
          evidenceRef: {
            pageUrl: SNAPSHOT.url,
            pageType: SNAPSHOT.pageType,
            issueType: "multiple_h1",
            evidenceKeys: ["h1_count", "heading_structure"],
            businessImpact: "low",
          },
          recommendation: "Keep one primary H1.",
        }),
        makeFinding({
          title: "No H1 heading detected",
          description: "The stored HTML does not contain an H1 heading.",
          severity: "medium",
          confidence: "high",
          evidenceLevel: "Measured",
          evidenceRef: {
            pageUrl: SNAPSHOT.url,
            pageType: SNAPSHOT.pageType,
            issueType: "missing_h1",
            evidenceKeys: ["h1_count", "heading_structure"],
            businessImpact: "medium",
          },
          recommendation: "Add one visible H1.",
        }),
      ],
    });

    expect(result.reviewStatus).toBe("needs_review");
    expect(result.retryCount).toBe(2);
    expect(result.acceptedFindings).toHaveLength(2);
    expect(result.findings.filter((finding) => finding.evaluatorStatus === "needs_review")).toHaveLength(2);
    expect(result.escalationReason).toContain("duplicate missing_title");
    expect(result.escalationReason).toContain("contradiction with multiple_h1");
  });
});
