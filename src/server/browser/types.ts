export type BrowserDriverName = "playwright" | "browser_use";
export type BrowserWaitUntil = "load" | "domcontentloaded" | "networkidle";

export interface BrowserSessionOptions {
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
}

export interface BrowserNavigateRequest {
  url: string;
  waitUntil?: BrowserWaitUntil;
  timeoutMs?: number;
}

export interface BrowserNavigationResult {
  url: string;
  ok: boolean;
  status?: number;
}

export interface BrowserScreenshotRequest {
  fullPage?: boolean;
  format?: "jpeg" | "png";
  quality?: number;
  timeoutMs?: number;
}

export interface BrowserScreenshotResult {
  data: Buffer;
  contentType: string;
}

export interface BrowserExtractionResult<T> {
  value: T;
}

export interface BrowserEvaluateRequest<TArg = unknown> {
  expression: string;
  arg?: TArg;
}

export type BrowserEvaluateResult<TResult> = BrowserExtractionResult<TResult>;

export interface BrowserDiscoveredLink {
  href: string;
  origin: string;
  pathname: string;
  text: string;
}

export interface BrowserSession {
  navigate(request: BrowserNavigateRequest): Promise<BrowserNavigationResult>;
  getUrl(): Promise<string>;
  extractHtml(): Promise<BrowserExtractionResult<string>>;
  evaluate<TResult, TArg = unknown>(
    request: BrowserEvaluateRequest<TArg>
  ): Promise<BrowserEvaluateResult<TResult>>;
  screenshot(request: BrowserScreenshotRequest): Promise<BrowserScreenshotResult>;
  close(): Promise<void>;
}

export interface BrowserDriver {
  readonly name: BrowserDriverName;
  createSession(options?: BrowserSessionOptions): Promise<BrowserSession>;
}
