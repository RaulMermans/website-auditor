import { beforeEach, describe, expect, it, vi } from "vitest";

const { queueClientMock, dispatchAuditRunMock, envMock } = vi.hoisted(() => ({
  queueClientMock: {
    fetch: vi.fn(),
    fail: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn(),
  },
  dispatchAuditRunMock: vi.fn(),
  envMock: { WORKER_SECRET: undefined as string | undefined },
}));

vi.mock("@/lib/env", () => ({
  env: envMock,
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

import { POST } from "@/app/api/worker/process/route";

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret) headers["x-worker-secret"] = secret;
  return new Request("http://localhost/api/worker/process", { method: "POST", headers });
}

describe("POST /api/worker/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueClientMock.fail.mockResolvedValue(undefined);
    // No WORKER_SECRET by default so auth passes
    envMock.WORKER_SECRET = undefined;
  });

  it("dispatches inline and returns 200 when job completes successfully", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-1",
      name: "audit.run",
      payload: { auditRunId: "run-1", domain: "example.com" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-1",
      pagesProcessed: 5,
      homepageOnly: false,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.auditRunId).toBe("run-1");
    expect(body.jobId).toBe("job-1");
    expect(dispatchAuditRunMock).toHaveBeenCalledWith(
      { jobId: "job-1", auditRunId: "run-1", domain: "example.com" },
      expect.objectContaining({ queue: queueClientMock })
    );
  });

  it("returns 500 when dispatch reports an errorMessage", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-2",
      name: "audit.run",
      payload: { auditRunId: "run-2", domain: "widget.io" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-2",
      pagesProcessed: 0,
      homepageOnly: true,
      errorMessage: "capture failed",
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.status).toBe("failed");
  });

  it("returns 500 and does not crash when dispatch throws unexpectedly", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-3",
      name: "audit.run",
      payload: { auditRunId: "run-3", domain: "crash.io" },
    });
    dispatchAuditRunMock.mockRejectedValue(new Error("playwright exploded"));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.status).toBe("failed");
  });

  it("returns 200 idle when no jobs are pending", async () => {
    queueClientMock.fetch.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("idle");
    expect(dispatchAuditRunMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the queue is unavailable", async () => {
    queueClientMock.fetch.mockRejectedValue(new Error("db gone"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
    expect(dispatchAuditRunMock).not.toHaveBeenCalled();
  });

  it("fails the job and returns 400 for malformed payload", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-bad",
      name: "audit.run",
      payload: { auditRunId: "", domain: "" },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(queueClientMock.fail).toHaveBeenCalledWith("audit.run", "job-bad", {
      error: "Malformed job payload",
    });
    expect(dispatchAuditRunMock).not.toHaveBeenCalled();
  });

  it("returns 401 when a wrong secret is provided", async () => {
    envMock.WORKER_SECRET = "supersecretvalue1234";
    queueClientMock.fetch.mockResolvedValue(null);

    const res = await POST(makeRequest("wrong-secret"));

    expect(res.status).toBe(401);
    expect(queueClientMock.fetch).not.toHaveBeenCalled();
  });

  it("transitions job out of created state by fetching before dispatching", async () => {
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

    // Fetching the job moves it from 'created' → 'active' in pg-boss before dispatch
    expect(queueClientMock.fetch).toHaveBeenCalledWith("audit.run");
    expect(dispatchAuditRunMock).toHaveBeenCalled();
  });
});
