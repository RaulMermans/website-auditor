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

// TODO: implement with real HTTP call to worker endpoint + HMAC auth
export const workerClient: WorkerClient = {
  async capture(request) {
    console.warn("[worker] stub capture — no real worker wired:", request.auditRunId);
    return {
      auditRunId: request.auditRunId,
      pagesProcessed: 0,
      homepageOnly: true,
      errorMessage: "worker not implemented",
    };
  },
};
