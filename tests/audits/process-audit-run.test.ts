import { describe, expect, it, vi } from "vitest";
import { processAuditRun } from "@/server/audits/process-audit-run";

function makeProgress(options?: {
  auditRunId?: string;
  status?: import("@/lib/types").AuditStatus;
  pageSnapshots?: Array<Record<string, unknown>>;
  homepageOnly?: boolean;
  failureReason?: string | null;
  limitationNote?: string | null;
}) {
  const now = new Date("2026-04-23T10:00:00.000Z");

  return {
    auditRun: {
      id: options?.auditRunId ?? "run-123",
      projectId: null,
      targetDomainId: "target-1",
      status: options?.status ?? "pending",
      homepageOnly: options?.homepageOnly ?? true,
      startedAt: now,
      completedAt: null,
      failureReason: options?.failureReason ?? null,
      limitationNote: options?.limitationNote ?? null,
      createdAt: now,
    },
    pageSnapshots: (options?.pageSnapshots ?? []) as any,
  };
}

describe("processAuditRun", () => {
  it("marks the run complete after capture and analysis succeed", async () => {
    const auditJobs = {
      getAuditRunProgress: vi
        .fn()
        .mockResolvedValueOnce(makeProgress())
        .mockResolvedValueOnce(
          makeProgress({
            status: "capturing",
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "homepage",
                pageState: "captured",
                htmlStorageKey: "shot_homepage.html",
              },
            ],
          })
        )
        .mockResolvedValueOnce(
          makeProgress({
            status: "analyzing",
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "homepage",
                pageState: "accepted",
                htmlStorageKey: "shot_homepage.html",
              },
            ],
          })
        ),
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    };
    const capture = vi.fn().mockResolvedValue({
      auditRunId: "run-123",
      pagesProcessed: 1,
      homepageOnly: true,
    });
    const analyze = vi.fn().mockResolvedValue({
      auditRunId: "run-123",
      pageEvidence: [],
      findings: [],
    });

    const result = await processAuditRun(
      {
        auditRunId: "run-123",
        domain: "example.com",
      },
      { auditJobs, capture, analyze }
    );

    expect(auditJobs.updateAuditRunStatus).toHaveBeenNthCalledWith(1, {
      auditRunId: "run-123",
      status: "analyzing",
      homepageOnly: true,
    });
    expect(auditJobs.updateAuditRunStatus).toHaveBeenNthCalledWith(2, {
      auditRunId: "run-123",
      status: "complete",
      homepageOnly: true,
      failureReason: null,
      limitationNote: null,
    });
    expect(result).toEqual({
      auditRunId: "run-123",
      pagesProcessed: 1,
      homepageOnly: true,
      limitationNote: null,
    });
  });

  it("resumes from persisted captured pages without rerunning capture", async () => {
    const auditJobs = {
      getAuditRunProgress: vi
        .fn()
        .mockResolvedValueOnce(
          makeProgress({
            status: "capturing",
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "homepage",
                pageState: "accepted",
                htmlStorageKey: "shot_homepage.html",
              },
              {
                id: "snapshot-2",
                pageType: "contact",
                pageState: "captured",
                htmlStorageKey: "shot_contact.html",
              },
            ],
          })
        )
        .mockResolvedValueOnce(
          makeProgress({
            status: "analyzing",
            homepageOnly: false,
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "homepage",
                pageState: "accepted",
                htmlStorageKey: "shot_homepage.html",
              },
              {
                id: "snapshot-2",
                pageType: "contact",
                pageState: "accepted",
                htmlStorageKey: "shot_contact.html",
              },
            ],
          })
        ),
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    };
    const capture = vi.fn();
    const analyze = vi.fn().mockResolvedValue({
      auditRunId: "run-123",
      pageEvidence: [],
      findings: [],
    });

    const result = await processAuditRun(
      {
        auditRunId: "run-123",
        domain: "example.com",
      },
      { auditJobs, capture, analyze }
    );

    expect(capture).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledWith("run-123");
    expect(result).toEqual({
      auditRunId: "run-123",
      pagesProcessed: 2,
      homepageOnly: false,
      limitationNote: null,
    });
  });

  it("marks the run failed if analysis fails after capture", async () => {
    const auditJobs = {
      getAuditRunProgress: vi
        .fn()
        .mockResolvedValueOnce(makeProgress())
        .mockResolvedValueOnce(
          makeProgress({
            status: "capturing",
            homepageOnly: false,
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "homepage",
                pageState: "captured",
                htmlStorageKey: "shot_homepage.html",
              },
              {
                id: "snapshot-2",
                pageType: "contact",
                pageState: "captured",
                htmlStorageKey: "shot_contact.html",
              },
            ],
          })
        )
        .mockResolvedValueOnce(
          makeProgress({
            status: "analyzing",
            homepageOnly: false,
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "homepage",
                pageState: "captured",
                htmlStorageKey: "shot_homepage.html",
              },
              {
                id: "snapshot-2",
                pageType: "contact",
                pageState: "captured",
                htmlStorageKey: "shot_contact.html",
              },
            ],
          })
        ),
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    };
    const capture = vi.fn().mockResolvedValue({
      auditRunId: "run-456",
      pagesProcessed: 2,
      homepageOnly: false,
    });
    const analyze = vi.fn().mockRejectedValue(new Error("analysis failed"));

    const result = await processAuditRun(
      {
        auditRunId: "run-123",
        domain: "example.com",
      },
      { auditJobs, capture, analyze }
    );

    expect(auditJobs.updateAuditRunStatus).toHaveBeenNthCalledWith(1, {
      auditRunId: "run-123",
      status: "analyzing",
      homepageOnly: false,
    });
    expect(auditJobs.updateAuditRunStatus).toHaveBeenNthCalledWith(2, {
      auditRunId: "run-123",
      status: "failed",
      homepageOnly: false,
      failureReason: "The analysis step failed: analysis failed",
      failureKind: "analysis_error",
      failureStage: "analyze",
      failureDetails: {
        driver: undefined,
        marker: "analysis_exception",
        message: "analysis failed",
        retryable: true,
        source: "analysis",
        statusCode: undefined,
        url: undefined,
      },
    });
    expect(result.errorMessage).toBe("The analysis step failed: analysis failed");
  });

  it("marks browser-degraded static reports as partial complete with limitation note", async () => {
    const limitationNote =
      "Browser capture was blocked or degraded by a security challenge. This audit continued using public HTML/static evidence only, so it may not include rendered, protected, or post-hydration page states.";
    const auditJobs = {
      getAuditRunProgress: vi
        .fn()
        .mockResolvedValueOnce(makeProgress())
        .mockResolvedValueOnce(
          makeProgress({
            status: "capturing",
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "homepage",
                pageState: "captured",
                htmlStorageKey: "shot_homepage.html",
                captureMethod: "fallback_static",
              },
            ],
          })
        )
        .mockResolvedValueOnce(
          makeProgress({
            status: "analyzing",
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "homepage",
                pageState: "accepted",
                htmlStorageKey: "shot_homepage.html",
                captureMethod: "fallback_static",
              },
            ],
          })
        ),
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    };
    const capture = vi.fn().mockResolvedValue({
      auditRunId: "run-123",
      pagesProcessed: 1,
      homepageOnly: true,
      limitationNote,
    });
    const analyze = vi.fn().mockResolvedValue({
      auditRunId: "run-123",
      pageEvidence: [{ id: "evidence-1" }],
      findings: [],
    });

    const result = await processAuditRun(
      { auditRunId: "run-123", domain: "example.com" },
      { auditJobs, capture, analyze }
    );

    expect(auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith({
      auditRunId: "run-123",
      status: "partial_complete",
      homepageOnly: true,
      failureReason: null,
      limitationNote,
    });
    expect(result).toEqual({
      auditRunId: "run-123",
      pagesProcessed: 1,
      homepageOnly: true,
      limitationNote,
    });
  });

  it("calls updateAuditRunStatus with no failure fields when completing cleanly", async () => {
    // Regression guard: all nullable params ($3–$8) must be acceptable as undefined/null.
    // Before explicit type casts were added to the SQL, passing null here caused
    // `could not determine data type of parameter $4` in Postgres.
    const progress = makeProgress({
      status: "analyzing",
      pageSnapshots: [
        {
          id: "snapshot-1",
          pageType: "homepage",
          pageState: "accepted",
          htmlStorageKey: "homepage.html",
        },
      ],
    });
    const auditJobs = {
      getAuditRunProgress: vi.fn().mockResolvedValue(progress),
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    };
    const capture = vi.fn();
    const analyze = vi.fn().mockResolvedValue({});

    await processAuditRun(
      { auditRunId: "run-abc", domain: "example.com" },
      { auditJobs, capture, analyze }
    );

    expect(auditJobs.updateAuditRunStatus).toHaveBeenCalledWith({
      auditRunId: "run-abc",
      status: "complete",
      homepageOnly: true,
      failureReason: null,
      limitationNote: null,
    });
  });

  it("marks the run failed if capture throws before returning a result", async () => {
    const initialProgress = makeProgress({ auditRunId: "run-789" });
    const auditJobs = {
      getAuditRunProgress: vi
        .fn()
        .mockResolvedValueOnce(initialProgress)
        .mockResolvedValueOnce(initialProgress),
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    };
    const capture = vi.fn().mockRejectedValue(new Error("browser launch failed"));
    const analyze = vi.fn();

    const result = await processAuditRun(
      {
        auditRunId: "run-789",
        domain: "example.com",
      },
      { auditJobs, capture, analyze }
    );

    expect(auditJobs.updateAuditRunStatus).toHaveBeenCalledWith({
      auditRunId: "run-789",
      status: "failed",
      homepageOnly: true,
      failureReason: "browser launch failed",
      failureKind: "runtime_error",
      failureStage: "discover",
      failureDetails: {
        driver: undefined,
        marker: "browser_launch",
        message: "browser launch failed",
        retryable: true,
        source: "runtime",
        statusCode: undefined,
        url: undefined,
      },
    });
    expect(analyze).not.toHaveBeenCalled();
    expect(result).toEqual({
      auditRunId: "run-789",
      pagesProcessed: 0,
      homepageOnly: true,
      errorMessage: "browser launch failed",
    });
  });

  it("resolves partial_complete when homepage is blocked but secondary evidence was captured", async () => {
    // No homepage snapshot — only secondary pages were captured via secondary static sweep.
    // The limitation note is the signal that this is homepage-blocked mode.
    const limitationNote =
      "Homepage capture was blocked by a security or bot-challenge page. This audit was completed using accessible public secondary pages and static technical evidence only. Findings are bounded to the inspected public evidence and do not include homepage-specific observations (hero clarity, above-the-fold UX, or rendered visual hierarchy).";

    const auditJobs = {
      getAuditRunProgress: vi
        .fn()
        .mockResolvedValueOnce(makeProgress())
        .mockResolvedValueOnce(
          makeProgress({
            status: "capturing",
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "about",
                pageState: "captured",
                htmlStorageKey: "shot_about.html",
              },
              {
                id: "snapshot-2",
                pageType: "contact",
                pageState: "captured",
                htmlStorageKey: "shot_contact.html",
              },
            ],
          })
        )
        .mockResolvedValueOnce(
          makeProgress({
            status: "analyzing",
            pageSnapshots: [
              {
                id: "snapshot-1",
                pageType: "about",
                pageState: "accepted",
                htmlStorageKey: "shot_about.html",
              },
              {
                id: "snapshot-2",
                pageType: "contact",
                pageState: "accepted",
                htmlStorageKey: "shot_contact.html",
              },
            ],
          })
        ),
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    };
    const capture = vi.fn().mockResolvedValue({
      auditRunId: "run-hp-blocked",
      pagesProcessed: 2,
      homepageOnly: false,
      limitationNote,
    });
    const analyze = vi.fn().mockResolvedValue({
      auditRunId: "run-hp-blocked",
      pageEvidence: [{ id: "evidence-1" }],
      findings: [],
    });

    const result = await processAuditRun(
      { auditRunId: "run-hp-blocked", domain: "example.com" },
      { auditJobs, capture, analyze }
    );

    // Must be partial_complete, not failed
    expect(auditJobs.updateAuditRunStatus).toHaveBeenLastCalledWith({
      auditRunId: "run-hp-blocked",
      status: "partial_complete",
      homepageOnly: false,
      failureReason: null,
      limitationNote,
    });
    expect(result.limitationNote).toBe(limitationNote);
    expect(result.errorMessage).toBeUndefined();
    // Analysis still ran on secondary evidence
    expect(analyze).toHaveBeenCalledWith("run-hp-blocked");
  });
});
