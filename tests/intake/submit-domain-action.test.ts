import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  createAuditJobMock,
  AuditJobEnqueueErrorMock,
  afterMock,
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
  afterMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/server/audits/create-audit-job", () => ({
  AuditJobEnqueueError: AuditJobEnqueueErrorMock,
  createAuditJob: createAuditJobMock,
}));

import { submitDomainAction } from "@/app/intake/actions";

const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

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
    fetchSpy.mockResolvedValue(new Response(null, { status: 202 }));
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

  it("registers after() for server-side worker trigger on success", async () => {
    createAuditJobMock.mockResolvedValue({
      targetDomain: { id: "td-1", domain: "example.com" },
      auditRun: { id: "run-1", status: "pending" },
      jobId: "job-1",
    });

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow("REDIRECT:");

    // after() must be registered (server-side trigger path)
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("after() callback fires server-side fetch to the process route", async () => {
    createAuditJobMock.mockResolvedValue({
      targetDomain: { id: "td-1", domain: "example.com" },
      auditRun: { id: "run-1", status: "pending" },
      jobId: "job-1",
    });

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow("REDIRECT:");

    // Execute the registered after() callback
    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    expect(callback).toBeTypeOf("function");
    await callback();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/worker/process"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("after() callback handles trigger failure without throwing", async () => {
    createAuditJobMock.mockResolvedValue({
      targetDomain: { id: "td-1", domain: "example.com" },
      auditRun: { id: "run-2", status: "pending" },
      jobId: "job-2",
    });

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow("REDIRECT:");

    fetchSpy.mockRejectedValueOnce(new Error("network error"));

    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    // Must not throw — failure is logged but not propagated
    await expect(callback()).resolves.toBeUndefined();
  });

  it("does NOT register after() when job creation fails", async () => {
    createAuditJobMock.mockRejectedValue(new Error("db down"));

    const formData = new FormData();
    formData.set("domain", "example.com");

    await expect(submitDomainAction(formData)).rejects.toThrow("REDIRECT:");

    expect(afterMock).not.toHaveBeenCalled();
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
