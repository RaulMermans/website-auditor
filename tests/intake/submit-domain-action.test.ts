import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  createAuditJobMock,
  AuditJobEnqueueErrorMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  createAuditJobMock: vi.fn(),
  AuditJobEnqueueErrorMock: class AuditJobEnqueueErrorMock extends Error {
    constructor(
      readonly auditRunId: string,
      message: string
    ) {
      super(message);
      this.name = "AuditJobEnqueueError";
    }
  },
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/server/audits/create-audit-job", () => ({
  AuditJobEnqueueError: AuditJobEnqueueErrorMock,
  createAuditJob: createAuditJobMock,
}));

import { submitDomainAction } from "@/app/intake/actions";

const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

function buildIntakeUrl(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  return `/intake?${searchParams.toString()}`;
}

describe("submitDomainAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("redirects to the success state when audit job creation succeeds", async () => {
    createAuditJobMock.mockResolvedValue({
      targetDomain: {
        id: "target-domain-1",
        domain: "example.com",
      },
      auditRun: {
        id: "audit-run-1",
        status: "pending",
      },
      jobId: "job-1",
    });

    const formData = new FormData();
    formData.set("domain", "Example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow(
      `REDIRECT:${buildIntakeUrl({
        success: "1",
        domain: "example.com",
        auditRunId: "audit-run-1",
        status: "pending",
      })}`
    );

    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("triggers worker fetch directly (server-side, not deferred) on success", async () => {
    createAuditJobMock.mockResolvedValue({
      targetDomain: { id: "td-1", domain: "example.com" },
      auditRun: { id: "run-1", status: "pending" },
      jobId: "job-1",
    });

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow("REDIRECT:");

    // fetch must be called synchronously before redirect — no after() indirection
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/worker/process"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("passes auditRunId and domain in the worker trigger body", async () => {
    createAuditJobMock.mockResolvedValue({
      targetDomain: { id: "td-1", domain: "example.com" },
      auditRun: { id: "run-1", status: "pending" },
      jobId: "job-1",
    });

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow("REDIRECT:");

    const [, fetchInit] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((fetchInit as RequestInit).body as string);
    expect(body.auditRunId).toBe("run-1");
    expect(body.domain).toBe("example.com");
  });

  it("still redirects when worker trigger fetch fails", async () => {
    createAuditJobMock.mockResolvedValue({
      targetDomain: { id: "td-1", domain: "example.com" },
      auditRun: { id: "run-2", status: "pending" },
      jobId: "job-2",
    });

    fetchSpy.mockRejectedValueOnce(new Error("network error"));

    const formData = new FormData();
    formData.set("domain", "example.com");

    // fetch failure must not prevent redirect
    await expect(submitDomainAction(formData)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT trigger fetch when job creation fails", async () => {
    createAuditJobMock.mockRejectedValue(new Error("db down"));

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow("REDIRECT:");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("redirects to the generic error state when persistence fails", async () => {
    createAuditJobMock.mockRejectedValue(new Error("db down"));

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow(
      `REDIRECT:${buildIntakeUrl({
        error: "We couldn't save the audit request right now.",
        domain: "example.com",
      })}`
    );

    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the truthful failed status when queueing fails after persistence", async () => {
    createAuditJobMock.mockRejectedValue(
      new AuditJobEnqueueErrorMock(
        "audit-run-2",
        "Audit request was saved, but queueing failed. The audit run was marked failed."
      )
    );

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow(
      `REDIRECT:${buildIntakeUrl({
        error: "Audit request was saved, but queueing failed. The audit run was marked failed.",
        domain: "example.com",
        auditRunId: "audit-run-2",
        status: "failed",
      })}`
    );

    expect(redirectMock).toHaveBeenCalledTimes(1);
  });
});
