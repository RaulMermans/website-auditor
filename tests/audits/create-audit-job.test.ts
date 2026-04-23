import { describe, it, expect, vi } from "vitest";
import type { AuditJobRepository } from "@/db/audits";
import {
  AuditJobEnqueueError,
  createAuditJob,
} from "@/server/audits/create-audit-job";
import type { QueueClient } from "@/server/contracts/queue";

const persistedRecord = {
  targetDomain: {
    id: "target-domain-1",
    domain: "example.com",
    createdAt: new Date("2026-04-18T08:00:00.000Z"),
  },
  auditRun: {
    id: "audit-run-1",
    projectId: null,
    targetDomainId: "target-domain-1",
    status: "pending" as const,
    homepageOnly: false,
    startedAt: new Date("2026-04-18T08:00:00.000Z"),
    completedAt: null,
    failureReason: null,
    createdAt: new Date("2026-04-18T08:00:00.000Z"),
  },
};

function createDeps() {
  const auditJobs: AuditJobRepository = {
    createPendingAuditRun: vi.fn().mockResolvedValue(persistedRecord),
    markAuditRunFailed: vi.fn().mockResolvedValue(undefined),
    updateAuditRunStatus: vi.fn().mockResolvedValue(undefined),
    insertPageSnapshot: vi.fn().mockResolvedValue(undefined),
    updatePageSnapshotState: vi.fn().mockResolvedValue(undefined),
    completePageSnapshotCapture: vi.fn().mockResolvedValue(undefined),
  };
  const queue: QueueClient = {
    enqueue: vi.fn().mockResolvedValue({
      id: "job-1",
      name: "audit.run",
      payload: { auditRunId: "audit-run-1", domain: "example.com" },
    }),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };

  return { auditJobs, queue };
}

describe("createAuditJob", () => {
  it("persists a normalized domain and enqueues an audit job", async () => {
    const deps = createDeps();
    const result = await createAuditJob({ domain: "https://Example.com/" }, deps);

    expect(deps.auditJobs.createPendingAuditRun).toHaveBeenCalledWith({
      domain: "example.com",
      projectId: undefined,
    });
    expect(deps.queue.enqueue).toHaveBeenCalledWith("audit.run", {
      auditRunId: "audit-run-1",
      domain: "example.com",
    });
    expect(result.targetDomain.domain).toBe("example.com");
    expect(result.auditRun.status).toBe("pending");
    expect(result.auditRun.homepageOnly).toBe(false);
    expect(result.jobId).toBe("job-1");
  });

  it("does not enqueue when persistence fails", async () => {
    const deps = createDeps();
    vi.mocked(deps.auditJobs.createPendingAuditRun).mockRejectedValueOnce(new Error("db down"));

    await expect(createAuditJob({ domain: "example.com" }, deps)).rejects.toThrow("db down");
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it("marks the audit run failed when enqueue fails", async () => {
    const deps = createDeps();
    vi.mocked(deps.queue.enqueue).mockRejectedValueOnce(new Error("queue down"));

    await expect(createAuditJob({ domain: "example.com" }, deps)).rejects.toBeInstanceOf(
      AuditJobEnqueueError
    );
    expect(deps.auditJobs.markAuditRunFailed).toHaveBeenCalledWith({
      auditRunId: "audit-run-1",
      failureReason: "Failed to enqueue audit job: queue down",
    });
  });

  it("reports a truthful failure if enqueue fails and status update also fails", async () => {
    const deps = createDeps();
    vi.mocked(deps.queue.enqueue).mockRejectedValueOnce(new Error("queue down"));
    vi.mocked(deps.auditJobs.markAuditRunFailed).mockRejectedValueOnce(
      new Error("update failed")
    );

    await expect(createAuditJob({ domain: "example.com" }, deps)).rejects.toMatchObject({
      name: "AuditJobEnqueueError",
      auditRunId: "audit-run-1",
      message:
        "Audit request was saved, but queueing failed and the run could not be marked failed.",
    });
  });
});
