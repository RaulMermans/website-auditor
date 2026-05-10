import { describe, expect, it, vi } from "vitest";
import { processAuditRun, getAuditPagePriorityGroup } from "@/server/audits/process-audit-run";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeProgress(options?: {
  auditRunId?: string;
  status?: import("@/lib/types").AuditStatus;
  pageSnapshots?: Array<Record<string, unknown>>;
  homepageOnly?: boolean;
  limitationNote?: string | null;
}) {
  const now = new Date("2026-05-10T10:00:00.000Z");

  return {
    auditRun: {
      id: options?.auditRunId ?? "run-test",
      projectId: null,
      targetDomainId: "target-1",
      status: options?.status ?? "pending",
      homepageOnly: options?.homepageOnly ?? false,
      startedAt: now,
      completedAt: null,
      failureReason: null,
      limitationNote: options?.limitationNote ?? null,
      createdAt: now,
    },
    pageSnapshots: (options?.pageSnapshots ?? []) as any,
  };
}

function makeSnap(
  pageType: string,
  pageState: "accepted" | "needs_review" | "failed",
  htmlKey = "snap.html"
) {
  return { id: `snap-${pageType}`, pageType, pageState, htmlStorageKey: htmlKey };
}

const noop = vi.fn().mockResolvedValue({});

// ─── getAuditPagePriorityGroup ───────────────────────────────────────────────

describe("getAuditPagePriorityGroup", () => {
  it("classifies homepage/contact/services/pricing as high", () => {
    expect(getAuditPagePriorityGroup("homepage")).toBe("high");
    expect(getAuditPagePriorityGroup("contact")).toBe("high");
    expect(getAuditPagePriorityGroup("services")).toBe("high");
    expect(getAuditPagePriorityGroup("pricing")).toBe("high");
    expect(getAuditPagePriorityGroup("product")).toBe("high");
    expect(getAuditPagePriorityGroup("form")).toBe("high");
  });

  it("classifies about/content/blog as medium", () => {
    expect(getAuditPagePriorityGroup("about")).toBe("medium");
    expect(getAuditPagePriorityGroup("content")).toBe("medium");
  });

  it("classifies legal/other as low", () => {
    expect(getAuditPagePriorityGroup("legal")).toBe("low");
    expect(getAuditPagePriorityGroup("other")).toBe("low");
  });

  it("defaults unknown/null pageType to medium", () => {
    expect(getAuditPagePriorityGroup(null)).toBe("medium");
    expect(getAuditPagePriorityGroup(undefined)).toBe("medium");
  });
});

// ─── resolveCompletionStatus through processAuditRun ────────────────────────

async function runCompletion(
  snapshotsAfterAnalysis: Array<Record<string, unknown>>,
  limitationNote?: string | null
) {
  const finalProgress = makeProgress({
    status: "analyzing",
    pageSnapshots: snapshotsAfterAnalysis,
    limitationNote,
  });

  const auditJobs = {
    getAuditRunProgress: vi.fn().mockResolvedValue(finalProgress),
    updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
  };
  const capture = vi.fn();
  const analyze = vi.fn().mockResolvedValue({});

  await processAuditRun(
    { auditRunId: "run-test", domain: "example.com" },
    { auditJobs, capture, analyze }
  );

  const lastCall = auditJobs.updateAuditRunStatus.mock.calls.at(-1)?.[0];
  return lastCall?.status as import("@/lib/types").AuditStatus;
}

describe("completion policy — primary cases", () => {
  it("complete when all pages are accepted with no limitation note", async () => {
    const status = await runCompletion([
      makeSnap("homepage", "accepted"),
      makeSnap("contact", "accepted"),
      makeSnap("about", "accepted"),
    ]);
    expect(status).toBe("complete");
  });

  it("partial_complete when homepage+contact accepted and secondary pages need_review", async () => {
    // The scenario from the smoke test: blog + legal notice needs_review should NOT block
    const status = await runCompletion([
      makeSnap("homepage", "accepted"),
      makeSnap("contact", "accepted"),
      makeSnap("legal", "needs_review"),
      makeSnap("about", "needs_review"),
    ]);
    expect(status).toBe("partial_complete");
  });

  it("partial_complete when homepage+contact+legal accepted and blog+legal2 needs_review", async () => {
    const status = await runCompletion([
      makeSnap("homepage", "accepted"),
      makeSnap("contact", "accepted"),
      makeSnap("legal", "accepted"),
      makeSnap("about", "needs_review"),
      makeSnap("content", "needs_review"),
    ]);
    expect(status).toBe("partial_complete");
  });

  it("needs_human_review when homepage itself needs_review", async () => {
    const status = await runCompletion([
      makeSnap("homepage", "needs_review"),
      makeSnap("contact", "accepted"),
      makeSnap("legal", "accepted"),
    ]);
    expect(status).toBe("needs_human_review");
  });

  it("needs_human_review when contact (high-priority) needs_review", async () => {
    const status = await runCompletion([
      makeSnap("homepage", "accepted"),
      makeSnap("contact", "needs_review"),
      makeSnap("about", "accepted"),
    ]);
    expect(status).toBe("needs_human_review");
  });

  it("needs_human_review when only legal pages were accepted", async () => {
    const status = await runCompletion([
      makeSnap("homepage", "needs_review"),
      makeSnap("legal", "accepted"),
      makeSnap("legal", "accepted"),
    ]);
    expect(status).toBe("needs_human_review");
  });

  it("needs_human_review when majority of pages are problematic", async () => {
    // 3 out of 4 pages failed/needs_review
    const status = await runCompletion([
      makeSnap("homepage", "accepted"),
      makeSnap("contact", "failed"),
      makeSnap("about", "needs_review"),
      makeSnap("content", "needs_review"),
    ]);
    expect(status).toBe("needs_human_review");
  });

  it("failed when no accepted pages exist", async () => {
    const status = await runCompletion([
      makeSnap("homepage", "needs_review"),
      makeSnap("contact", "needs_review"),
    ]);
    expect(status).toBe("failed");
  });

  it("partial_complete when homepage is accepted with a limitation note", async () => {
    const status = await runCompletion(
      [makeSnap("homepage", "accepted")],
      "Browser capture was blocked."
    );
    expect(status).toBe("partial_complete");
  });
});

describe("completion policy — homepage-blocked partial mode", () => {
  it("partial_complete when no homepage but secondary accepted + limitation note", async () => {
    const auditJobs = {
      getAuditRunProgress: vi
        .fn()
        .mockResolvedValueOnce(makeProgress())
        .mockResolvedValueOnce(
          makeProgress({
            status: "capturing",
            pageSnapshots: [
              makeSnap("about", "accepted"),
              makeSnap("contact", "accepted"),
            ],
          })
        )
        .mockResolvedValueOnce(
          makeProgress({
            status: "analyzing",
            pageSnapshots: [
              makeSnap("about", "accepted"),
              makeSnap("contact", "accepted"),
            ],
          })
        ),
      updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    };
    const limitationNote = "Homepage was blocked by bot-challenge. Secondary sweep used.";
    const capture = vi.fn().mockResolvedValue({
      auditRunId: "run-test",
      pagesProcessed: 2,
      homepageOnly: false,
      limitationNote,
    });
    const analyze = vi.fn().mockResolvedValue({});

    await processAuditRun(
      { auditRunId: "run-test", domain: "example.com" },
      { auditJobs, capture, analyze }
    );

    const lastStatus = auditJobs.updateAuditRunStatus.mock.calls.at(-1)?.[0]?.status;
    expect(lastStatus).toBe("partial_complete");
  });
});
