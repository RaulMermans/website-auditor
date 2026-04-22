import type { Browser, BrowserContext, Page } from "playwright-core";
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

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_USER_AGENT = "WebsiteAuditorAgent/1.0 (+https://example.com/bot)";

function normalizeBrowserError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

export function normalizePlaywrightChromiumLaunchError(error: unknown): Error {
  const normalized = normalizeBrowserError(error);

  if (/ETXTBSY/i.test(normalized.message)) {
    return new Error(
      [
        "Chromium binary busy (ETXTBSY): concurrent launch attempted before extraction finished.",
        `Original error: ${normalized.message}`,
      ].join(" "),
      { cause: normalized }
    );
  }

  if (
    !/Executable doesn't exist|Cannot find module ['"](?:playwright-core|@sparticuz\/chromium)['"]/i.test(
      normalized.message
    )
  ) {
    return normalized;
  }

  return new Error(
    [
      "Playwright Chromium is unavailable in this deployment.",
      "Ensure @sparticuz/chromium and playwright-core are installed and the binary can be decompressed at runtime.",
      `Original error: ${normalized.message}`,
    ].join(" "),
    { cause: normalized }
  );
}

// Cached at module scope so the /tmp extraction runs at most once per process instance,
// preventing concurrent ETXTBSY when two requests hit the same warm Lambda.
let chromiumExecPathPromise: Promise<string> | null = null;

async function getChromiumExecutablePath(): Promise<string> {
  if (!chromiumExecPathPromise) {
    console.log("[audit-capture] chromium: starting executable path resolution (first call)");
    chromiumExecPathPromise = (async () => {
      const { default: chromium } = await import("@sparticuz/chromium");

      chromium.setGraphicsMode = false;

      const executablePath = await chromium.executablePath();
      console.log(`[audit-capture] chromium: executable path resolved to: ${executablePath}`);
      return executablePath;
    })();
  } else {
    console.log("[audit-capture] chromium: reusing cached executable path promise");
  }

  return chromiumExecPathPromise;
}

class PlaywrightChromiumSession implements BrowserSession {
  constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page
  ) {}

  async navigate(request: BrowserNavigateRequest): Promise<BrowserNavigationResult> {
    const response = await this.page.goto(request.url, {
      waitUntil: request.waitUntil,
      timeout: request.timeoutMs,
    });

    return {
      url: this.page.url(),
      ok: response?.ok() ?? false,
      status: response?.status(),
    };
  }

  async getUrl(): Promise<string> {
    return this.page.url();
  }

  async extractHtml(): Promise<BrowserExtractionResult<string>> {
    return {
      value: await this.page.content(),
    };
  }

  async evaluate<TResult, TArg = unknown>(
    request: BrowserEvaluateRequest<TArg>
  ): Promise<BrowserEvaluateResult<TResult>> {
    const value = await this.page.evaluate(
      ({ expression, arg }) => {
        const evaluator = new Function("arg", `return (${expression})(arg);`) as (
          argument: unknown
        ) => unknown;

        return evaluator(arg);
      },
      { expression: request.expression, arg: request.arg }
    );

    return {
      value: value as TResult,
    };
  }

  async screenshot(request: BrowserScreenshotRequest): Promise<BrowserScreenshotResult> {
    const format = request.format ?? "png";
    const data = await this.page.screenshot({
      fullPage: request.fullPage,
      type: format,
      quality: format === "jpeg" ? request.quality : undefined,
      timeout: request.timeoutMs,
    });

    return {
      data,
      contentType: format === "jpeg" ? "image/jpeg" : "image/png",
    };
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}

export class PlaywrightChromiumDriver implements BrowserDriver {
  readonly name = "playwright" as const;

  async createSession(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    try {
      process.env.PLAYWRIGHT_BROWSERS_PATH = "0";

      const executablePath = await getChromiumExecutablePath();
      const { default: chromium } = await import("@sparticuz/chromium");
      const { chromium: playwrightChromium } = await import("playwright-core");

      console.log("[audit-capture] launching browser...");

      const browser = await playwrightChromium.launch({
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        executablePath,
        headless: true,
      });

      console.log("[audit-capture] browser launched successfully");

      const context = await browser.newContext({
        viewport: options.viewport ?? DEFAULT_VIEWPORT,
        userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      });

      context.setDefaultTimeout(45000);
      context.setDefaultNavigationTimeout(45000);

      const page = await context.newPage();

      return new PlaywrightChromiumSession(browser, context, page);
    } catch (error) {
      console.error("[audit-capture] launch failed:", error);
      throw normalizePlaywrightChromiumLaunchError(error);
    }
  }
}
