import type {
  BrowserDriver,
  BrowserEvaluateRequest,
  BrowserEvaluateResult,
  BrowserExtractionResult,
  BrowserNavigateRequest,
  BrowserNavigationResult,
  BrowserScreenshotRequest,
  BrowserScreenshotResult,
  BrowserSession,
  BrowserSessionOptions,
} from "@/server/browser/types";

export interface BrowserUseDriverConfig {
  baseUrl: string;
  apiToken?: string;
}

interface BrowserUseCreateSessionResponse {
  sessionId: string;
}

interface BrowserUseExtractHtmlResponse {
  html: string;
}

interface BrowserUseScreenshotResponse {
  dataBase64: string;
  contentType?: string;
}

// TODO(browser-use): implement a sidecar/service that translates these repo-owned HTTP
// endpoints to browser-use browser primitives. Keep browser-use orchestration on the other
// side of this boundary; the app should only see navigate/evaluate/html/screenshot/session APIs.
class BrowserUseSession implements BrowserSession {
  constructor(
    private readonly config: BrowserUseDriverConfig,
    private readonly sessionId: string
  ) {}

  async navigate(request: BrowserNavigateRequest): Promise<BrowserNavigationResult> {
    return requestBrowserUse<BrowserNavigationResult>(this.config, {
      method: "POST",
      path: `/sessions/${this.sessionId}/navigate`,
      body: request,
    });
  }

  async getUrl(): Promise<string> {
    const result = await requestBrowserUse<{ url: string }>(this.config, {
      method: "GET",
      path: `/sessions/${this.sessionId}`,
    });

    return result.url;
  }

  async extractHtml(): Promise<BrowserExtractionResult<string>> {
    const result = await requestBrowserUse<BrowserUseExtractHtmlResponse>(this.config, {
      method: "POST",
      path: `/sessions/${this.sessionId}/content`,
    });

    return {
      value: result.html,
    };
  }

  async evaluate<TResult, TArg = unknown>(
    request: BrowserEvaluateRequest<TArg>
  ): Promise<BrowserEvaluateResult<TResult>> {
    return requestBrowserUse<BrowserEvaluateResult<TResult>>(this.config, {
      method: "POST",
      path: `/sessions/${this.sessionId}/evaluate`,
      body: request,
    });
  }

  async screenshot(request: BrowserScreenshotRequest): Promise<BrowserScreenshotResult> {
    const result = await requestBrowserUse<BrowserUseScreenshotResponse>(this.config, {
      method: "POST",
      path: `/sessions/${this.sessionId}/screenshot`,
      body: request,
    });

    return {
      data: Buffer.from(result.dataBase64, "base64"),
      contentType: result.contentType ?? (request.format === "jpeg" ? "image/jpeg" : "image/png"),
    };
  }

  async close(): Promise<void> {
    await requestBrowserUse(this.config, {
      method: "DELETE",
      path: `/sessions/${this.sessionId}`,
      expectJson: false,
    });
  }
}

interface BrowserUseRequestInit {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  expectJson?: boolean;
}

function getBrowserUseHeaders(config: BrowserUseDriverConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiToken) {
    headers.Authorization = `Bearer ${config.apiToken}`;
  }

  return headers;
}

async function requestBrowserUse<TResult>(
  config: BrowserUseDriverConfig,
  request: BrowserUseRequestInit
): Promise<TResult> {
  const response = await fetch(new URL(request.path, config.baseUrl), {
    method: request.method,
    headers: getBrowserUseHeaders(config),
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });

  if (!response.ok) {
    const body = await response.text();
    const detail = body ? `: ${body}` : "";
    throw new Error(`Browser Use driver request failed (${response.status})${detail}`);
  }

  if (request.expectJson === false || response.status === 204) {
    return undefined as TResult;
  }

  return (await response.json()) as TResult;
}

export class BrowserUseDriver implements BrowserDriver {
  readonly name = "browser_use" as const;

  constructor(private readonly config: BrowserUseDriverConfig) {}

  async createSession(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    const response = await requestBrowserUse<BrowserUseCreateSessionResponse>(this.config, {
      method: "POST",
      path: "/sessions",
      body: options,
    });

    return new BrowserUseSession(this.config, response.sessionId);
  }
}
