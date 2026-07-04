import type { BrowserDriver, BrowserSession } from "@/server/browser/types";
import { browserDriver as defaultBrowserDriver } from "@/server/browser/create-browser-driver";
import { assertPublicUrl, assertSameOriginOrApproved, SSRFError } from "@/lib/ssrf";
import type { StorageClient } from "@/server/contracts/storage";

// ─── Capture contract ─────────────────────────────────────────────────────────

export type RenderedCaptureStatus = "success" | "blocked" | "timeout" | "failed";

export type BlockerKind =
  | "cloudflare"
  | "captcha"
  | "login"
  | "forbidden"
  | "rate_limited"
  | "security_challenge"
  | "timeout"
  | "unknown";

export interface RenderedCaptureResult {
  status: RenderedCaptureStatus;
  url: string;
  finalUrl?: string;
  statusCode?: number;

  title?: string;
  h1Texts: string[];
  visibleTextSample: string;
  /** Full extracted document HTML, used by the deterministic findings engine downstream. */
  html: string;

  desktopScreenshotPath?: string;
  mobileScreenshotPath?: string;

  ctaCandidates: Array<{
    text: string;
    selector?: string;
    href?: string;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;

  pageMetrics: {
    domElementCount: number;
    scriptCount: number;
    imageCount: number;
    headingCount: number;
    linkCount: number;
  };

  blocker?: {
    detected: boolean;
    kind: BlockerKind;
    evidence: string;
  };

  capturedAt: string;
  errorMessage?: string;
}

export interface CaptureRenderedPageOptions {
  driver?: BrowserDriver;
  storage?: Pick<StorageClient, "put">;
  storageKeyPrefix?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NAVIGATION_TIMEOUT_MS = 15_000;
const TOTAL_CAPTURE_TIMEOUT_MS = 30_000;
const VISIBLE_TEXT_SAMPLE_MAX = 2_000;
const MAX_CTA_CANDIDATES = 10;

const EMPTY_METRICS: RenderedCaptureResult["pageMetrics"] = {
  domElementCount: 0,
  scriptCount: 0,
  imageCount: 0,
  headingCount: 0,
  linkCount: 0,
};

// ─── Blocker classification ───────────────────────────────────────────────────

interface BlockerPattern {
  kind: BlockerKind;
  patterns: RegExp[];
}

const BLOCKER_PATTERNS: BlockerPattern[] = [
  {
    kind: "cloudflare",
    patterns: [
      /cloudflare/i,
      /checking your browser/i,
      /just a moment/i,
      /ddos protection by cloudflare/i,
    ],
  },
  {
    kind: "captcha",
    patterns: [
      /captcha/i,
      /verify you are human/i,
      /are you a robot/i,
      /i'?m not a robot/i,
      /recaptcha/i,
      /hcaptcha/i,
    ],
  },
  {
    kind: "security_challenge",
    patterns: [
      /attention required/i,
      /one more step/i,
      /security check/i,
      /security challenge/i,
      /challenge page/i,
    ],
  },
  {
    kind: "forbidden",
    patterns: [
      /403 forbidden/i,
      /access denied/i,
      /you don'?t have permission/i,
      /you do not have permission/i,
    ],
  },
  {
    kind: "login",
    patterns: [
      /\bsign in to\b/i,
      /\bplease log in\b/i,
      /\bplease sign in\b/i,
      /\blogin required\b/i,
      /\bsign in required\b/i,
    ],
  },
];

/**
 * Determines whether a page looks like a bot challenge, auth wall, or access
 * denial. Returns undefined for clean pages. Pure function — no I/O.
 */
export function classifyBlocker(
  title: string,
  bodyText: string,
  statusCode?: number
): RenderedCaptureResult["blocker"] | undefined {
  if (statusCode === 403) {
    return { detected: true, kind: "forbidden", evidence: "HTTP 403" };
  }
  if (statusCode === 401) {
    return { detected: true, kind: "login", evidence: "HTTP 401" };
  }
  if (statusCode === 429) {
    return { detected: true, kind: "rate_limited", evidence: "HTTP 429" };
  }

  const combined = `${title} ${bodyText}`.substring(0, 3_000);

  for (const { kind, patterns } of BLOCKER_PATTERNS) {
    for (const pattern of patterns) {
      const match = combined.match(pattern);
      if (match) {
        return {
          detected: true,
          kind,
          evidence: match[0].substring(0, 120),
        };
      }
    }
  }

  return undefined;
}

// ─── Browser expressions (executed in page context via evaluate) ──────────────

// These strings are sent to page.evaluate() via new Function().
// They must be self-contained valid JS arrow functions with no Node.js deps.

const EXPR_TITLE = `() => document.title || ""`;

const EXPR_H1_TEXTS = `() => Array.from(document.querySelectorAll('h1')).map(function(h) {
  return (h.innerText || h.textContent || '').trim();
}).filter(function(t) { return t.length > 0; })`;

const EXPR_VISIBLE_TEXT = (maxLen: number) =>
  `() => ((document.body ? document.body.innerText : '') || '').trim().substring(0, ${maxLen})`;

const EXPR_PAGE_METRICS = `() => ({
  domElementCount: document.querySelectorAll('*').length,
  scriptCount: document.querySelectorAll('script').length,
  imageCount: document.querySelectorAll('img').length,
  headingCount: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
  linkCount: document.querySelectorAll('a[href]').length
})`;

const EXPR_CTA_CANDIDATES = (maxCandidates: number) =>
  `() => {
  var sel = 'a[href], button, [role="button"], input[type="submit"]';
  var els = Array.from(document.querySelectorAll(sel));
  var kw = /\\b(contact|book|schedule|start|get started|request|demo|quote|buy|sign up|subscribe|call|talk|learn more|try|shop|order|download|register|join|apply)\\b/i;
  var out = [];
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var txt = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
    if (!txt || txt.length < 2 || txt.length > 100) continue;
    if (!kw.test(txt)) continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    out.push({
      text: txt,
      href: el.getAttribute('href') || undefined,
      boundingBox: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    });
    if (out.length >= ${maxCandidates}) break;
  }
  return out;
}`;

// ─── Capture implementation ───────────────────────────────────────────────────

function makeFailedResult(
  url: string,
  capturedAt: string,
  status: RenderedCaptureStatus,
  errorMessage: string,
  partial?: Partial<RenderedCaptureResult>
): RenderedCaptureResult {
  return {
    status,
    url,
    h1Texts: [],
    visibleTextSample: "",
    html: "",
    ctaCandidates: [],
    pageMetrics: EMPTY_METRICS,
    capturedAt,
    errorMessage,
    ...partial,
  };
}

async function runCapture(
  session: BrowserSession,
  url: string,
  capturedAt: string,
  storage: CaptureRenderedPageOptions["storage"],
  storageKeyPrefix: string | undefined
): Promise<RenderedCaptureResult> {
  let response: Awaited<ReturnType<typeof session.navigate>>;
  try {
    response = await session.navigate({ url, waitUntil: "load", timeoutMs: NAVIGATION_TIMEOUT_MS });
  } catch (navError) {
    const msg = navError instanceof Error ? navError.message : String(navError);
    const isTimeout = /timeout|timed out|exceeded/i.test(msg);
    return makeFailedResult(url, capturedAt, isTimeout ? "timeout" : "failed", msg, {
      blocker: isTimeout
        ? { detected: true, kind: "timeout", evidence: msg.substring(0, 120) }
        : undefined,
    });
  }

  const finalUrl = await session.getUrl();

  try {
    await assertPublicUrl(finalUrl);
    assertSameOriginOrApproved(url, finalUrl);
  } catch (ssrfError) {
    if (ssrfError instanceof SSRFError) {
      return makeFailedResult(url, capturedAt, "failed", `Redirect rejected: ${ssrfError.message}`, {
        finalUrl,
      });
    }
    throw ssrfError;
  }

  const safeEval = async <T>(expression: string, fallback: T): Promise<T> => {
    try {
      const { value } = await session.evaluate<T>({ expression });
      return value;
    } catch {
      return fallback;
    }
  };

  const title = await safeEval<string>(EXPR_TITLE, "");
  const h1Texts = await safeEval<string[]>(EXPR_H1_TEXTS, []);
  const visibleTextSample = await safeEval<string>(
    EXPR_VISIBLE_TEXT(VISIBLE_TEXT_SAMPLE_MAX),
    ""
  );

  const blocker = classifyBlocker(title, visibleTextSample, response.status);
  if (blocker) {
    return {
      status: "blocked",
      url,
      finalUrl,
      statusCode: response.status,
      title,
      h1Texts,
      visibleTextSample,
      html: "",
      ctaCandidates: [],
      pageMetrics: EMPTY_METRICS,
      blocker,
      capturedAt,
    };
  }

  const pageMetrics = await safeEval<RenderedCaptureResult["pageMetrics"]>(
    EXPR_PAGE_METRICS,
    EMPTY_METRICS
  );

  const ctaCandidates = await safeEval<RenderedCaptureResult["ctaCandidates"]>(
    EXPR_CTA_CANDIDATES(MAX_CTA_CANDIDATES),
    []
  );

  const desktopScreenshot = await session
    .screenshot({ fullPage: true, format: "jpeg", quality: 80 })
    .catch(() => null);

  let desktopScreenshotPath: string | undefined;
  if (desktopScreenshot && storage && storageKeyPrefix) {
    desktopScreenshotPath = await storage
      .put(`${storageKeyPrefix}/desktop.jpg`, desktopScreenshot.data, desktopScreenshot.contentType)
      .catch(() => undefined);
  }

  // Mobile screenshots require viewport manipulation not yet exposed by BrowserSession.
  // mobileScreenshotPath remains undefined until BrowserSession gains setViewport().

  const html = await session
    .extractHtml()
    .then((result) => result.value)
    .catch(() => "");

  return {
    status: "success",
    url,
    finalUrl,
    statusCode: response.status,
    title,
    h1Texts,
    visibleTextSample,
    html,
    desktopScreenshotPath,
    ctaCandidates,
    pageMetrics,
    capturedAt,
  };
}

/**
 * Deterministic read-only Playwright rendered capture.
 *
 * Launches Chromium, navigates to the target URL, extracts structured evidence,
 * takes a desktop screenshot, classifies any blocker page, and closes the browser.
 * Never clicks, fills, or interacts with the page.
 *
 * Returns a serializable RenderedCaptureResult — always, even on failure.
 * Throws only for truly unhandled runtime errors outside the capture boundary.
 *
 * Architecture position:
 *   Playwright rendered capture → evidence normalization → deterministic findings
 *   → optional Prospect Audit Agent enrichment
 *
 * The Prospect Audit Agent does NOT control this function. It only consumes
 * the validated evidence package that is produced downstream of this result.
 */
export async function captureRenderedPage(
  url: string,
  options: CaptureRenderedPageOptions = {}
): Promise<RenderedCaptureResult> {
  const driver = options.driver ?? defaultBrowserDriver;
  const capturedAt = new Date().toISOString();

  try {
    await assertPublicUrl(url);
  } catch (error) {
    if (error instanceof SSRFError) {
      return makeFailedResult(url, capturedAt, "failed", `SSRF protection: ${error.message}`);
    }
    throw error;
  }

  let session: BrowserSession;
  try {
    session = await driver.createSession({ viewport: { width: 1280, height: 800 } });
  } catch (launchError) {
    return makeFailedResult(
      url,
      capturedAt,
      "failed",
      `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`
    );
  }

  try {
    const capturePromise = runCapture(
      session,
      url,
      capturedAt,
      options.storage,
      options.storageKeyPrefix
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Total capture timed out after ${TOTAL_CAPTURE_TIMEOUT_MS}ms`)),
        TOTAL_CAPTURE_TIMEOUT_MS
      )
    );

    return await Promise.race([capturePromise, timeoutPromise]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = /timeout|timed out/i.test(msg);
    return makeFailedResult(url, capturedAt, isTimeout ? "timeout" : "failed", msg);
  } finally {
    await session.close().catch(() => undefined);
  }
}
