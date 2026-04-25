import { describe, expect, it } from "vitest";
import {
  captureOutcomeFromFailureKind,
  planCaptureMethod,
} from "@/lib/capture-policy";

describe("planCaptureMethod", () => {
  it("returns browser for homepage when not degraded", () => {
    const plan = planCaptureMethod({ pageType: "homepage", browserDegraded: false });
    expect(plan.captureMethod).toBe("browser");
    expect(plan.requiresScreenshot).toBe(true);
    expect(plan.browserAllowed).toBe(true);
    expect(plan.reason).toBe("homepage_discovery_and_screenshot");
  });

  it("returns browser for secondary page when not degraded", () => {
    const plan = planCaptureMethod({ pageType: "about", browserDegraded: false });
    expect(plan.captureMethod).toBe("browser");
    expect(plan.browserAllowed).toBe(true);
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
