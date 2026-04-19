import { describe, expect, it, vi } from "vitest";
import { processAuditRun } from "@/server/audits/process-audit-run";

describe("processAuditRun", () => {
  it("marks the run complete after capture and analysis succeed", async () => {
    const auditJobs = {
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
    });
    expect(result.errorMessage).toBeUndefined();
  });

  it("marks the run failed if analysis fails after capture", async () => {
    const auditJobs = {
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
        auditRunId: "run-456",
        domain: "example.com",
      },
      { auditJobs, capture, analyze }
    );

    expect(auditJobs.updateAuditRunStatus).toHaveBeenNthCalledWith(1, {
      auditRunId: "run-456",
      status: "analyzing",
      homepageOnly: false,
    });
    expect(auditJobs.updateAuditRunStatus).toHaveBeenNthCalledWith(2, {
      auditRunId: "run-456",
      status: "failed",
      homepageOnly: false,
      failureReason: "analysis failed",
    });
    expect(result.errorMessage).toBe("analysis failed");
  });
});
