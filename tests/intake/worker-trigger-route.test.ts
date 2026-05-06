import { beforeEach, describe, expect, it, vi } from "vitest";

const { queueClientMock, dispatchAuditRunMock } = vi.hoisted(() => ({
  queueClientMock: {
    fetch: vi.fn(),
    fail: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn(),
  },
  dispatchAuditRunMock: vi.fn(),
}));

vi.mock("@/server/contracts/queue", () => ({
  queueClient: queueClientMock,
}));

vi.mock("@/server/audits/dispatch-audit-run", () => ({
  dispatchAuditRun: dispatchAuditRunMock,
}));

vi.mock("@/server/audits/process-audit-run", () => ({
  processAuditRun: vi.fn(),
}));

import { POST } from "@/app/api/worker/trigger/route";

function makeRequest(): Request {
  return new Request("http://localhost/api/worker/trigger", { method: "POST" });
}

describe("POST /api/worker/trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueClientMock.fail.mockResolvedValue(undefined);
  });

  it("returns idle when no jobs are pending", async () => {
    queueClientMock.fetch.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("idle");
    expect(dispatchAuditRunMock).not.toHaveBeenCalled();
  });

  it("fetches the pending job and dispatches it", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-1",
      name: "audit.run",
      payload: { auditRunId: "run-1", domain: "example.com" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-1",
      pagesProcessed: 3,
      homepageOnly: false,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("complete");
    expect(body.auditRunId).toBe("run-1");
    expect(body.pagesProcessed).toBe(3);
    expect(dispatchAuditRunMock).toHaveBeenCalledWith(
      { jobId: "job-1", auditRunId: "run-1", domain: "example.com" },
      expect.objectContaining({ queue: queueClientMock })
    );
  });

  it("returns failed status when dispatch returns an error message", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-2",
      name: "audit.run",
      payload: { auditRunId: "run-2", domain: "example.com" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-2",
      pagesProcessed: 0,
      homepageOnly: true,
      errorMessage: "capture failed",
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.status).toBe("failed");
    expect(body.errorMessage).toBe("capture failed");
  });

  it("returns 503 when the queue is unavailable", async () => {
    queueClientMock.fetch.mockRejectedValue(new Error("db connection failed"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
  });

  it("fails and returns 400 for malformed job payloads", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-3",
      name: "audit.run",
      payload: { auditRunId: "", domain: "" },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(queueClientMock.fail).toHaveBeenCalledWith("audit.run", "job-3", {
      error: "Malformed job payload",
    });
    expect(dispatchAuditRunMock).not.toHaveBeenCalled();
  });

  it("transitions pending jobs out of created state by fetching them", async () => {
    // This is the core fix: calling fetch() on pg-boss transitions the job
    // from 'created' to 'active', so it is no longer inert.
    queueClientMock.fetch.mockResolvedValue({
      id: "job-stuck",
      name: "audit.run",
      payload: { auditRunId: "run-stuck", domain: "dontecho.com" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-stuck",
      pagesProcessed: 1,
      homepageOnly: true,
    });

    await POST(makeRequest());

    expect(queueClientMock.fetch).toHaveBeenCalledWith("audit.run");
    expect(dispatchAuditRunMock).toHaveBeenCalled();
  });
});
