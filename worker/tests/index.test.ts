import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import { server } from "../src/index.js";
import { processCaptureJob } from "../src/capture.js";

// Mock the capture job to prevent Playwright and Postgres execution
vi.mock("../src/capture.js", () => ({
  processCaptureJob: vi.fn(),
}));

describe("Worker HTTP Server", () => {
  const secret = process.env.WORKER_SECRET || "test-secret";
  const port = 3005;
  const baseUrl = `http://localhost:${port}`;

  beforeAll(() => {
    process.env.WORKER_SECRET = secret;
    process.env.DATABASE_URL = "postgres://test:test@localhost/test";
    
    return new Promise((resolve) => {
      server.listen(port, () => resolve(undefined));
    });
  });

  afterAll(() => {
    return new Promise((resolve) => {
      server.close(() => resolve(undefined));
    });
  });

  it("responds to /health with 200", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("rejects POST /capture without a signature", async () => {
    const payload = JSON.stringify({ auditRunId: "123", domain: "example.com" });
    const response = await fetch(`${baseUrl}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized: invalid signature" });
    expect(processCaptureJob).not.toHaveBeenCalled();
  });

  it("rejects POST /capture with an invalid signature", async () => {
    const payload = JSON.stringify({ auditRunId: "123", domain: "example.com" });
    const response = await fetch(`${baseUrl}/capture`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-worker-signature": "invalid-sig" 
      },
      body: payload,
    });
    
    expect(response.status).toBe(401);
  });

  it("accepts valid signed request and invokes capture job", async () => {
    const payloadObject = { auditRunId: "valid-run-123", domain: "example.com" };
    const payload = JSON.stringify(payloadObject);
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    // Mock successful execution
    vi.mocked(processCaptureJob).mockResolvedValueOnce({
      auditRunId: "valid-run-123",
      pagesProcessed: 2,
      homepageOnly: false,
    });

    const response = await fetch(`${baseUrl}/capture`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-worker-signature": signature 
      },
      body: payload,
    });
    
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      auditRunId: "valid-run-123",
      pagesProcessed: 2,
      homepageOnly: false,
    });

    // Verify job function was called with parsed payload
    expect(processCaptureJob).toHaveBeenCalledWith(
      "postgres://test:test@localhost/test",
      payloadObject
    );
  });

  it("rejects requests missing required fields", async () => {
    const payload = JSON.stringify({ auditRunId: "123" }); // domain is missing
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    const response = await fetch(`${baseUrl}/capture`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-worker-signature": signature 
      },
      body: payload,
    });
    
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Missing required fields" });
  });
});
