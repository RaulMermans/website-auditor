import { createHmac } from "node:crypto";
import process from "node:process";

// Worker contract — defines the boundary between the app runtime and the
// separate Node.js Playwright worker. All browser-heavy work (discovery,
// screenshots, DOM extraction, traces) MUST be dispatched through this interface.

export interface WorkerCaptureRequest {
  auditRunId: string;
  domain: string;
  maxPages?: number;
}

export interface WorkerCaptureResult {
  auditRunId: string;
  pagesProcessed: number;
  homepageOnly: boolean;
  errorMessage?: string;
}

export interface WorkerClient {
  capture(request: WorkerCaptureRequest): Promise<WorkerCaptureResult>;
}

export const workerClient: WorkerClient = {
  async capture(request) {
    const endpoint = process.env.WORKER_ENDPOINT || "http://localhost:3001";
    const secret = process.env.WORKER_SECRET;

    if (!secret) {
      throw new Error("WORKER_SECRET is not configured");
    }

    const payload = JSON.stringify(request);
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    try {
      const response = await fetch(`${endpoint}/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-signature": signature,
        },
        body: payload,
      });

      if (!response.ok) {
        throw new Error(`Worker HTTP error: ${response.status}`);
      }

      return (await response.json()) as WorkerCaptureResult;
    } catch (error) {
      console.error("[worker-client] capture failed:", error);
      return {
        auditRunId: request.auditRunId,
        pagesProcessed: 0,
        homepageOnly: true,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};
