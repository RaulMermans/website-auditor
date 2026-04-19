import { describe, expect, it, vi } from "vitest";
import { dispatchAuditRun } from "@/server/audits/dispatch-audit-run";

describe("dispatchAuditRun", () => {
  it("completes the queued job when internal processing succeeds", async () => {
    const queue = {
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const process = vi.fn().mockResolvedValue({
      auditRunId: "run-123",
      pagesProcessed: 2,
      homepageOnly: false,
    });

    const result = await dispatchAuditRun(
      {
        jobId: "job-123",
        auditRunId: "run-123",
        domain: "example.com",
      },
      { queue, process }
    );

    expect(process).toHaveBeenCalledWith({
      auditRunId: "run-123",
      domain: "example.com",
      maxPages: undefined,
    });
    expect(queue.complete).toHaveBeenCalledWith("audit.run", "job-123", {
      auditRunId: "run-123",
      pagesProcessed: 2,
      homepageOnly: false,
    });
    expect(queue.fail).not.toHaveBeenCalled();
    expect(result.errorMessage).toBeUndefined();
  });

  it("fails the queued job when internal processing returns an error", async () => {
    const queue = {
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const process = vi.fn().mockResolvedValue({
      auditRunId: "run-456",
      pagesProcessed: 0,
      homepageOnly: true,
      errorMessage: "capture failed",
    });

    const result = await dispatchAuditRun(
      {
        jobId: "job-456",
        auditRunId: "run-456",
        domain: "example.com",
      },
      { queue, process }
    );

    expect(queue.fail).toHaveBeenCalledWith("audit.run", "job-456", {
      auditRunId: "run-456",
      errorMessage: "capture failed",
    });
    expect(queue.complete).not.toHaveBeenCalled();
    expect(result.errorMessage).toBe("capture failed");
  });
});
