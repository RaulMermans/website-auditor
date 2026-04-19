import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  afterMock,
  createAuditJobMock,
  dispatchAuditRunMock,
  AuditJobEnqueueErrorMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  afterMock: vi.fn(),
  createAuditJobMock: vi.fn(),
  dispatchAuditRunMock: vi.fn(),
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

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/server/audits/create-audit-job", () => ({
  AuditJobEnqueueError: AuditJobEnqueueErrorMock,
  createAuditJob: createAuditJobMock,
}));

vi.mock("@/server/audits/dispatch-audit-run", () => ({
  dispatchAuditRun: dispatchAuditRunMock,
}));

import { submitDomainAction } from "@/app/intake/actions";

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
    afterMock.mockImplementation(() => undefined);
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

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledTimes(1);
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

    expect(afterMock).not.toHaveBeenCalled();
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

    expect(afterMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });
});
