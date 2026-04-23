import { describe, expect, it, vi } from "vitest";
import type {
  AuditAnalysisContext,
  AuditAnalysisRepository,
  ReplacePageAnalysisInput,
} from "@/db/analysis";
import { analyzeAuditRun } from "@/server/audits/analyze-audit-run";

function createContext(pageSnapshots?: AuditAnalysisContext["pageSnapshots"]): AuditAnalysisContext {
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
    pageSnapshots: pageSnapshots ?? [
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

function buildPersistedResult(inputs: ReplacePageAnalysisInput[]) {
  return {
    pageEvidence: inputs.flatMap((input, inputIndex) =>
      input.pageEvidence.map((item, itemIndex) => ({
        id: `evidence-${inputIndex + 1}-${itemIndex + 1}`,
        auditRunId: item.auditRunId,
        pageSnapshotId: item.pageSnapshotId,
        category: item.category,
        key: item.key,
        value: item.value,
        evidenceLevel: item.evidenceLevel,
        createdAt: new Date("2026-04-19T10:05:00.000Z"),
      }))
    ),
    findings: inputs.flatMap((input, inputIndex) =>
      input.findings.map((item, itemIndex) => ({
        id: `finding-${inputIndex + 1}-${itemIndex + 1}`,
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
      }))
    ),
  };
}

function createAnalysisDeps(
  context: AuditAnalysisContext,
  initialPersisted: ReplacePageAnalysisInput[] = []
) {
  const persistedByPage = new Map<string, ReplacePageAnalysisInput>();
  for (const input of initialPersisted) {
    persistedByPage.set(input.pageSnapshotId, input);
  }

  const analysisRepository: AuditAnalysisRepository = {
    getAuditAnalysisContext: vi.fn(async () => context),
    updatePageReviewState: vi.fn().mockResolvedValue(undefined),
    replacePageAnalysis: vi.fn(async (input) => {
      if (input.pageEvidence.length === 0 && input.findings.length === 0) {
        persistedByPage.delete(input.pageSnapshotId);
        return;
      }

      persistedByPage.set(input.pageSnapshotId, input);
    }),
    getPersistedAuditAnalysis: vi.fn(async () =>
      buildPersistedResult([...persistedByPage.values()])
    ),
  };

  const updatePageSnapshotState = vi.fn(async (input: any) => {
    const snapshot = context.pageSnapshots.find((candidate) => candidate.id === input.pageSnapshotId);
    if (!snapshot) {
      throw new Error(`Unknown snapshot ${input.pageSnapshotId}`);
    }

    snapshot.pageState = input.pageState;
    snapshot.retryCount = input.retryCount ?? snapshot.retryCount ?? 0;
    snapshot.lastError = input.lastError;
    return snapshot;
  });

  return {
    analysisRepository,
    persistedByPage,
    pageSnapshots: {
      updatePageSnapshotState,
    },
  };
}

describe("analyzeAuditRun", () => {
  it("persists evidence-backed findings with homepage-only scope truth", async () => {
    const context = createContext();
    const { analysisRepository, pageSnapshots, persistedByPage } = createAnalysisDeps(context);

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
      pageSnapshots,
    });

    const persistedInput = persistedByPage.get("snapshot-1");
    expect(persistedInput).toBeDefined();
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

  it("skips already accepted pages and resumes only captured pages", async () => {
    const now = new Date("2026-04-19T10:00:00.000Z");
    const context = createContext([
      {
        id: "snapshot-1",
        auditRunId: "run-123",
        url: "https://example.com/",
        pageType: "homepage",
        pagePriority: 0,
        pageState: "accepted",
        retryCount: 0,
        lastError: null,
        htmlStorageKey: "shot_run-123_homepage.html",
        screenshotStorageKey: "shot_run-123_homepage.jpg",
        capturedAt: now,
      },
      {
        id: "snapshot-2",
        auditRunId: "run-123",
        url: "https://example.com/contact",
        pageType: "contact",
        pagePriority: 50,
        pageState: "captured",
        retryCount: 0,
        lastError: null,
        htmlStorageKey: "shot_run-123_contact.html",
        screenshotStorageKey: "shot_run-123_contact.jpg",
        capturedAt: now,
      },
    ]);
    const persistedHomepage: ReplacePageAnalysisInput = {
      auditRunId: "run-123",
      pageSnapshotId: "snapshot-1",
      pageEvidence: [
        {
          auditRunId: "run-123",
          pageSnapshotId: "snapshot-1",
          category: "technical_seo",
          key: "title",
          value: { present: false },
          evidenceLevel: "Measured",
        },
      ],
      findings: [
        {
          auditRunId: "run-123",
          pageSnapshotId: "snapshot-1",
          category: "technical_seo",
          title: "Homepage-only audit: Missing page title",
          description: "Homepage-only audit: The captured HTML does not include a non-empty <title> tag.",
          severity: "high",
          confidence: "high",
          evidenceLevel: "Measured",
          evidenceRef: {
            pageUrl: "https://example.com/",
            pageType: "homepage",
            pageCount: 1,
            scope: "homepage_only",
            issueType: "missing_title",
            evidenceKeys: ["title"],
            businessImpact: "medium",
          },
          claimPosture: "confirmed",
          supportType: "dom",
          evaluatorStatus: "accepted",
          recommendation: "Homepage-only audit: Add a title.",
          reviewStatus: "accepted",
        },
      ],
    };
    const { analysisRepository, pageSnapshots, persistedByPage } = createAnalysisDeps(context, [
      persistedHomepage,
    ]);
    const storageGet = vi.fn().mockResolvedValue(
      Buffer.from(`
        <html>
          <body>
            <form>
              <label for="email">Email</label>
              <input id="email" name="email" required>
            </form>
          </body>
        </html>
      `)
    );

    await analyzeAuditRun("run-123", {
      analysisRepository,
      storage: { get: storageGet },
      pageSnapshots,
    });

    expect(storageGet).toHaveBeenCalledTimes(1);
    expect(storageGet).toHaveBeenCalledWith("shot_run-123_contact.html");
    expect(analysisRepository.replacePageAnalysis).toHaveBeenCalledTimes(1);
    expect(persistedByPage.has("snapshot-1")).toBe(true);
    expect(persistedByPage.has("snapshot-2")).toBe(true);
  });
});
