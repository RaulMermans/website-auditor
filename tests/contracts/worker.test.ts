import { describe, it, expect, vi, beforeEach } from "vitest";
import { workerClient } from "../../src/server/contracts/worker";
import { createHmac } from "node:crypto";

// Mock global fetch
global.fetch = vi.fn();

describe("workerClient contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws error if WORKER_SECRET is not set", async () => {
    delete process.env.WORKER_SECRET;
    await expect(workerClient.capture({ auditRunId: "test", domain: "test" }))
      .rejects
      .toThrow("WORKER_SECRET is not configured");
  });

  it("sends fetch request with correct HMAC header", async () => {
    process.env.WORKER_SECRET = "test-secret";
    process.env.WORKER_ENDPOINT = "http://fake-worker";

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ auditRunId: "test", pagesProcessed: 1, homepageOnly: false }),
    } as Response);

    const result = await workerClient.capture({ auditRunId: "test", domain: "test" });
    
    expect(result.pagesProcessed).toBe(1);
    
    const expectedPayload = JSON.stringify({ auditRunId: "test", domain: "test" });
    const expectedSig = createHmac("sha256", "test-secret").update(expectedPayload).digest("hex");

    expect(global.fetch).toHaveBeenCalledWith("http://fake-worker/capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-signature": expectedSig,
      },
      body: expectedPayload,
    });
  });

  it("returns fallback if fetch fails", async () => {
    process.env.WORKER_SECRET = "test-secret";
    process.env.WORKER_ENDPOINT = "http://fake-worker";

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const result = await workerClient.capture({ auditRunId: "fail-test", domain: "test" });
    
    expect(result.auditRunId).toBe("fail-test");
    expect(result.errorMessage).toMatch(/Worker HTTP error: 500/);
    expect(result.homepageOnly).toBe(true);
  });
});
