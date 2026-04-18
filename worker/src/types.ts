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

export type PageType = "homepage" | "about" | "services" | "contact" | "content" | "other";

export interface PageSnapshotPayload {
  auditRunId: string;
  url: string;
  pageType: PageType;
  htmlStorageKey?: string;
  screenshotStorageKey?: string;
}
