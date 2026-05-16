import { beforeEach, describe, expect, it, vi } from "vitest";

const { queueClientMock, dispatchAuditRunMock, envMock } = vi.hoisted(() => ({
  queueClientMock: {
    fetch: vi.fn(),
    fetchById: vi.fn(),
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

function makeRequestWithBody(body: object, secret?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-worker-secret"] = secret;
  return new Request("http://localhost/api/worker/process", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/worker/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueClientMock.fail.mockResolvedValue(undefined);
    queueClientMock.fetchById.mockResolvedValue(null);
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

  it("returns handled terminal response when dispatch reports expected capture denial", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-denied",
      name: "audit.run",
      payload: { auditRunId: "run-denied", domain: "blocked.example" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-denied",
      pagesProcessed: 0,
      homepageOnly: true,
      errorMessage: "The target denied this audit request.",
      failureKind: "access_denied",
      failureDetails: {
        source: "target",
        marker: "http_403",
        retryable: false,
      },
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      processed: 1,
      results: [
        {
          auditRunId: "run-denied",
          status: "terminal_failed",
          failureKind: "access_denied",
        },
      ],
    });
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

  it("returns 200 idle with correct message when no jobs are queued", async () => {
    queueClientMock.fetch.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("idle");
    expect(body.message).toBe("No queued audit jobs.");
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

  it("returns 401 when WORKER_SECRET is set but no secret header is provided", async () => {
    envMock.WORKER_SECRET = "supersecretvalue1234";
    queueClientMock.fetch.mockResolvedValue(null);

    const res = await POST(makeRequest(/* no secret */));

    expect(res.status).toBe(401);
    expect(queueClientMock.fetch).not.toHaveBeenCalled();
  });

  it("transitions job out of created state by fetching before dispatching (fallback path)", async () => {
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

    // No explicit job body → fallback generic fetch claims next available job
    expect(queueClientMock.fetch).toHaveBeenCalledWith("audit.run");
    expect(queueClientMock.fetchById).not.toHaveBeenCalled();
    expect(dispatchAuditRunMock).toHaveBeenCalled();
  });

  it("uses fetchById and does not call fetch when body contains jobId, auditRunId, and domain", async () => {
    queueClientMock.fetchById.mockResolvedValue({
      id: "job-explicit",
      name: "audit.run",
      payload: { auditRunId: "run-explicit", domain: "specific.com" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-explicit",
      pagesProcessed: 3,
      homepageOnly: false,
    });

    const res = await POST(
      makeRequestWithBody({ jobId: "job-explicit", auditRunId: "run-explicit", domain: "specific.com" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.auditRunId).toBe("run-explicit");
    expect(body.jobId).toBe("job-explicit");
    expect(queueClientMock.fetchById).toHaveBeenCalledWith("audit.run", "job-explicit");
    expect(queueClientMock.fetch).not.toHaveBeenCalled();
    expect(dispatchAuditRunMock).toHaveBeenCalledWith(
      { jobId: "job-explicit", auditRunId: "run-explicit", domain: "specific.com" },
      expect.objectContaining({ queue: queueClientMock })
    );
  });

  it("falls back to generic fetch when body is missing jobId", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-fallback",
      name: "audit.run",
      payload: { auditRunId: "run-fallback", domain: "fallback.com" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-fallback",
      pagesProcessed: 1,
      homepageOnly: true,
    });

    const res = await POST(
      makeRequestWithBody({ auditRunId: "run-fallback", domain: "fallback.com" })
    );

    expect(res.status).toBe(200);
    expect(queueClientMock.fetch).toHaveBeenCalledWith("audit.run");
    expect(queueClientMock.fetchById).not.toHaveBeenCalled();
  });

  it("returns idle when the specific job is not claimable via fetchById", async () => {
    queueClientMock.fetchById.mockResolvedValue(null);

    const res = await POST(
      makeRequestWithBody({ jobId: "job-gone", auditRunId: "run-gone", domain: "gone.com" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("idle");
    expect(queueClientMock.fetchById).toHaveBeenCalledWith("audit.run", "job-gone");
    expect(dispatchAuditRunMock).not.toHaveBeenCalled();
  });
});
