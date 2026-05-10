import { describe, expect, it } from "vitest";
import { getReportBadge } from "@/lib/report-presentation";

describe("getReportBadge", () => {
  it("returns 'Rendered audit' for rendered_browser + complete", () => {
    const badge = getReportBadge("complete", "rendered_browser");
    expect(badge.label).toBe("Rendered audit");
  });

  it("returns default 'Report ready' for complete without fidelity", () => {
    const badge = getReportBadge("complete");
    expect(badge.label).toBe("Report ready");
  });

  it("returns 'Mixed capture audit' for rendered_browser + partial_complete", () => {
    const badge = getReportBadge("partial_complete", "rendered_browser");
    expect(badge.label).toBe("Mixed capture audit");
  });

  it("returns 'Static fallback audit' for static_public + partial_complete", () => {
    const badge = getReportBadge("partial_complete", "static_public");
    expect(badge.label).toBe("Static fallback audit");
  });

  it("returns 'Partial/static audit' for secondary_static + partial_complete", () => {
    const badge = getReportBadge("partial_complete", "secondary_static");
    expect(badge.label).toBe("Partial/static audit");
  });

  it("returns 'Limited evidence audit' for blocked_no_evidence + partial_complete", () => {
    const badge = getReportBadge("partial_complete", "blocked_no_evidence");
    expect(badge.label).toBe("Limited evidence audit");
  });

  it("returns default 'Partial/static report' for partial_complete without fidelity", () => {
    const badge = getReportBadge("partial_complete");
    expect(badge.label).toBe("Partial/static report");
  });

  it("returns 'Needs review' for needs_human_review regardless of fidelity", () => {
    const badge = getReportBadge("needs_human_review", "rendered_browser");
    expect(badge.label).toBe("Needs review");
  });

  it("returns 'Run failed' for failed status", () => {
    const badge = getReportBadge("failed");
    expect(badge.label).toBe("Run failed");
  });

  it("preserves style properties from the base status meta", () => {
    const badge = getReportBadge("complete", "rendered_browser");
    expect(badge.background).toBeDefined();
    expect(badge.border).toBeDefined();
    expect(badge.text).toBeDefined();
  });
});
