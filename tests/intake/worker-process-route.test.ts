import { beforeEach, describe, expect, it, vi } from "vitest";

const { queueClientMock, dispatchAuditRunMock, afterMock, envMock } = vi.hoisted(() => ({
  queueClientMock: {
    fetch: vi.fn(),
    fail: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn(),
  },
  dispatchAuditRunMock: vi.fn(),
  afterMock: vi.fn(),
  envMock: { WORKER_SECRET: undefined as string | undefined },
}));

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});

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
    afterMock.mockImplementation((_cb: () => Promise<void>) => {
      // Capture but don't auto-execute; tests control execution
    });
    // No WORKER_SECRET by default so auth passes
    envMock.WORKER_SECRET = undefined;
  });

  it("returns 202 and schedules dispatch when job is pending", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-1",
      name: "audit.run",
      payload: { auditRunId: "run-1", domain: "example.com" },
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.status).toBe("accepted");
    expect(body.auditRunId).toBe("run-1");
    expect(body.jobId).toBe("job-1");

    // after() must be registered for background dispatch
    expect(afterMock).toHaveBeenCalledOnce();
  });

  it("after() callback invokes dispatchAuditRun with the correct job", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-2",
      name: "audit.run",
      payload: { auditRunId: "run-2", domain: "widget.io" },
    });
    dispatchAuditRunMock.mockResolvedValue({
      auditRunId: "run-2",
      pagesProcessed: 3,
      homepageOnly: false,
    });

    await POST(makeRequest());

    // Execute the captured after() callback
    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    expect(callback).toBeTypeOf("function");
    await callback();

    expect(dispatchAuditRunMock).toHaveBeenCalledWith(
      { jobId: "job-2", auditRunId: "run-2", domain: "widget.io" },
      expect.objectContaining({ queue: queueClientMock })
    );
  });

  it("after() callback swallows dispatch errors so the Lambda does not crash", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-3",
      name: "audit.run",
      payload: { auditRunId: "run-3", domain: "crash.io" },
    });
    dispatchAuditRunMock.mockRejectedValue(new Error("playwright exploded"));

    await POST(makeRequest());

    const callback = afterMock.mock.calls[0]?.[0] as () => Promise<void>;
    await expect(callback()).resolves.toBeUndefined();
  });

  it("returns 200 idle when no jobs are pending", async () => {
    queueClientMock.fetch.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("idle");
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the queue is unavailable", async () => {
    queueClientMock.fetch.mockRejectedValue(new Error("db gone"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
    expect(afterMock).not.toHaveBeenCalled();
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
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("returns 401 when a wrong secret is provided", async () => {
    envMock.WORKER_SECRET = "supersecretvalue1234";
    queueClientMock.fetch.mockResolvedValue(null);

    const res = await POST(makeRequest("wrong-secret"));

    expect(res.status).toBe(401);
    expect(queueClientMock.fetch).not.toHaveBeenCalled();
  });

  it("transitions job out of pending by fetching it before returning", async () => {
    queueClientMock.fetch.mockResolvedValue({
      id: "job-stuck",
      name: "audit.run",
      payload: { auditRunId: "run-stuck", domain: "dontecho.com" },
    });

    await POST(makeRequest());

    // Fetching the job is what moves it from 'created' → 'active' in pg-boss
    expect(queueClientMock.fetch).toHaveBeenCalledWith("audit.run");
  });
});
