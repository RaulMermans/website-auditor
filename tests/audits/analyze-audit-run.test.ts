import { describe, expect, it, vi } from "vitest";
import type {
  AuditAnalysisContext,
  AuditAnalysisRepository,
  ReplaceAuditAnalysisInput,
} from "@/db/analysis";
import { analyzeAuditRun } from "@/server/audits/analyze-audit-run";

function createContext(): AuditAnalysisContext {
  const now = new Date("2026-04-19T10:00:00.000Z");

  return {
    auditRun: {
      id: "run-123",
      projectId: null,
      targetDomainId: "target-1",
      status: "capturing",
      homepageOnly: true,
      startedAt: now,
      completedAt: null,
      failureReason: null,
      createdAt: now,
    },
    pageSnapshots: [
      {
        id: "snapshot-1",
        auditRunId: "run-123",
        url: "https://example.com/",
        pageType: "homepage",
        pagePriority: 0,
        pageState: "captured",
        retryCount: 0,
        lastError: null,
        htmlStorageKey: "shot_run-123_homepage.html",
        screenshotStorageKey: "shot_run-123_homepage.jpg",
        capturedAt: now,
      },
    ],
  };
}

describe("analyzeAuditRun", () => {
  it("persists evidence-backed findings with homepage-only scope truth", async () => {
    const context = createContext();
    let persistedInput: ReplaceAuditAnalysisInput | null = null;

    const analysisRepository: AuditAnalysisRepository = {
      getAuditAnalysisContext: vi.fn().mockResolvedValue(context),
      updatePageReviewState: vi.fn().mockResolvedValue(undefined),
      replaceAuditAnalysis: vi.fn().mockImplementation(async (input: ReplaceAuditAnalysisInput) => {
        persistedInput = input;

        return {
          pageEvidence: input.pageEvidence.map((item, index) => ({
            id: `evidence-${index + 1}`,
            auditRunId: item.auditRunId,
            pageSnapshotId: item.pageSnapshotId,
            category: item.category,
            key: item.key,
            value: item.value,
            evidenceLevel: item.evidenceLevel,
            createdAt: new Date("2026-04-19T10:05:00.000Z"),
          })),
          findings: input.findings.map((item, index) => ({
            id: `finding-${index + 1}`,
            auditRunId: item.auditRunId,
            pageSnapshotId: item.pageSnapshotId,
            category: item.category,
            title: item.title,
            description: item.description,
            severity: item.severity,
            confidence: item.confidence,
            evidenceLevel: item.evidenceLevel,
            evidenceRef: item.evidenceRef,
            claimPosture: item.claimPosture,
            supportType: item.supportType,
            evaluatorStatus: item.evaluatorStatus,
            evaluatorNotes: item.evaluatorNotes ?? null,
            recommendation: item.recommendation,
            reviewStatus: item.reviewStatus,
            reviewReason: item.reviewReason ?? null,
            createdAt: new Date("2026-04-19T10:05:00.000Z"),
          })),
        };
      }),
    };

    const result = await analyzeAuditRun("run-123", {
      analysisRepository,
      storage: {
        get: vi.fn().mockResolvedValue(
          Buffer.from(
            `
              <html>
                <head>
                  <meta name="robots" content="noindex,nofollow">
                </head>
                <body>
                  <img src="/hero.jpg">
                  <p>Lorem ipsum dolor sit amet.</p>
                </body>
              </html>
            `
          )
        ),
      },
      pageSnapshots: {
        updatePageSnapshotState: vi.fn().mockResolvedValue(context.pageSnapshots[0]),
      },
    });

    expect(persistedInput).not.toBeNull();
    expect(persistedInput!.pageEvidence.length).toBeGreaterThan(0);
    expect(persistedInput!.findings.length).toBeGreaterThan(0);
    expect(
      persistedInput!.findings.every((finding) => finding.reviewStatus === "accepted")
    ).toBe(true);
    expect(result.findings.every((finding) => finding.title.startsWith("Homepage-only audit:"))).toBe(
      true
    );
    expect(
      result.findings.every((finding) => finding.description.startsWith("Homepage-only audit:"))
    ).toBe(true);
    expect(
      result.findings.every((finding) =>
        ["Measured", "Observed", "Inferred"].includes(finding.evidenceLevel)
      )
    ).toBe(true);
    expect(
      result.findings.every((finding) => ["high", "medium", "low"].includes(finding.confidence))
    ).toBe(true);
    expect(
      result.findings.every((finding) =>
        ["critical", "high", "medium", "low", "info"].includes(finding.severity)
      )
    ).toBe(true);
    expect(result.findings.every((finding) => finding.evaluatorStatus)).toBe(true);
    expect(
      result.findings.every((finding) =>
        ["confirmed", "observed_pattern", "directional"].includes(finding.claimPosture!)
      )
    ).toBe(true);
    expect(
      result.findings.every((finding) =>
        ["dom", "cross_page", "inferred"].includes(finding.supportType!)
      )
    ).toBe(true);

    const evidenceLevels = result.findings.map((finding) => finding.evidenceLevel);
    expect(evidenceLevels).toContain("Measured");
    expect(evidenceLevels).toContain("Observed");
    expect(evidenceLevels).toContain("Inferred");

    expect(result.findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining([
        "technical_seo",
        "accessibility",
        "mobile_experience",
        "conversion",
        "messaging_content",
      ])
    );

    const scopeValues = result.findings.map((finding) => finding.evidenceRef.scope);
    expect(scopeValues.every((scope) => scope === "homepage_only")).toBe(true);
    expect(result.findings.every((finding) => finding.reviewStatus === "accepted")).toBe(true);
  });
});
