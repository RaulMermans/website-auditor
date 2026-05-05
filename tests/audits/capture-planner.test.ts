import { describe, expect, it } from "vitest";
import {
  assessPublicHtmlEvidence,
  captureOutcomeFromFailureKind,
  isJsShellHtml,
  planCaptureMethod,
} from "@/lib/capture-policy";

describe("planCaptureMethod", () => {
  it("returns static_preferred for homepage when not degraded", () => {
    const plan = planCaptureMethod({ pageType: "homepage", browserDegraded: false });
    expect(plan.captureMethod).toBe("static_preferred");
    expect(plan.requiresScreenshot).toBe(false);
    expect(plan.browserAllowed).toBe(true);
    expect(plan.reason).toBe("homepage_static_preferred");
  });

  it("returns static for secondary page when not degraded", () => {
    const plan = planCaptureMethod({ pageType: "about", browserDegraded: false });
    expect(plan.captureMethod).toBe("static");
    expect(plan.requiresScreenshot).toBe(false);
    expect(plan.browserAllowed).toBe(false);
    expect(plan.reason).toBe("secondary_page_static_sufficient");
  });

  it("returns static for all non-homepage page types when not degraded", () => {
    const pageTypes = ["about", "contact", "services", "pricing", "content", "legal", "form", "product", "other"] as const;
    for (const pageType of pageTypes) {
      const plan = planCaptureMethod({ pageType, browserDegraded: false });
      expect(plan.captureMethod).toBe("static");
      expect(plan.browserAllowed).toBe(false);
    }
  });

  it("returns fallback_static for homepage when browser is degraded", () => {
    const plan = planCaptureMethod({ pageType: "homepage", browserDegraded: true });
    expect(plan.captureMethod).toBe("fallback_static");
    expect(plan.requiresScreenshot).toBe(false);
    expect(plan.browserAllowed).toBe(false);
    expect(plan.reason).toBe("browser_degraded");
  });

  it("returns fallback_static for any page type when browser is degraded", () => {
    const pageTypes = ["about", "contact", "services", "pricing", "content"] as const;
    for (const pageType of pageTypes) {
      const plan = planCaptureMethod({ pageType, browserDegraded: true });
      expect(plan.captureMethod).toBe("fallback_static");
      expect(plan.browserAllowed).toBe(false);
    }
  });
});

describe("isJsShellHtml", () => {
  it("returns true for empty or near-empty HTML", () => {
    expect(isJsShellHtml("<html></html>")).toBe(true);
    expect(isJsShellHtml("<html><body></body></html>")).toBe(true);
    expect(isJsShellHtml('<html data-url="https://example.com/"></html>')).toBe(true);
  });

  it("returns true for HTML with only a few link tags (thin discovery HTML)", () => {
    const thin = "<html><body><a href='/about'>About</a><a href='/contact'>Contact</a></body></html>";
    expect(isJsShellHtml(thin)).toBe(true);
  });

  it("returns true when content is only inside script/style tags (stripped)", () => {
    const shell = `<html><head><script>var app=window.__APP_DATA__||{}</script><style>body{margin:0}</style></head><body><div id="root"></div></html>`;
    expect(isJsShellHtml(shell)).toBe(true);
  });

  it("returns false for HTML with substantial visible text content", () => {
    const rich = `<html><body>
      <h1>Grow your business with better leads</h1>
      <p>We help agencies and consultants turn their website into a predictable lead generation machine.
      Our audits identify exactly what is holding your site back from converting more visitors into qualified prospects.
      Book a free strategy call today and see how we can help you scale faster without extra ad spend.</p>
      <ul><li>More qualified leads</li><li>Higher conversion rates</li><li>Clear messaging</li></ul>
    </body></html>`;
    expect(isJsShellHtml(rich)).toBe(false);
  });
});

describe("assessPublicHtmlEvidence", () => {
  it("accepts bounded static evidence when public HTML has structure and cues", () => {
    const html = `<html><head><title>Example Consulting</title></head><body>
      <main><h1>Website audits for growing service teams</h1>
      <p>We help teams improve clarity, trust, and conversion with public HTML diagnostics.</p>
      <a href="/contact">Contact us</a><a href="/services">Services</a></main>
      <footer>Contact hello@example.com Privacy Terms</footer>
    </body></html>`;

    expect(assessPublicHtmlEvidence(html)).toMatchObject({
      usable: true,
      titlePresent: true,
      headingCount: 1,
    });
  });

  it("rejects meaningless shells even when HTML exists", () => {
    expect(assessPublicHtmlEvidence('<html><body><div id="root"></div></body></html>').usable)
      .toBe(false);
  });
});

describe("captureOutcomeFromFailureKind", () => {
  it("maps capture_blocked to browser_blocked_challenge", () => {
    expect(captureOutcomeFromFailureKind("capture_blocked")).toBe("browser_blocked_challenge");
  });

  it("maps auth_wall to authentication_required", () => {
    expect(captureOutcomeFromFailureKind("auth_wall")).toBe("authentication_required");
  });

  it("maps runtime_error to rendering_failed", () => {
    expect(captureOutcomeFromFailureKind("runtime_error")).toBe("rendering_failed");
  });

  it("maps blocked to no_usable_public_capture", () => {
    expect(captureOutcomeFromFailureKind("blocked")).toBe("no_usable_public_capture");
  });

  it("maps unknown to no_usable_public_capture", () => {
    expect(captureOutcomeFromFailureKind("unknown")).toBe("no_usable_public_capture");
  });
});
