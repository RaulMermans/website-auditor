import { describe, expect, it } from "vitest";
import {
  getAuditStatusMeta,
  getReportBadge,
  isReportReadyStatus,
  safeFormatDate,
  UNKNOWN_AUDIT_STATUS_META,
} from "@/lib/report-presentation";

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

describe("getAuditStatusMeta", () => {
  it("returns the known status meta for a recognized status", () => {
    expect(getAuditStatusMeta("complete").label).toBe("Report ready");
  });

  it("returns UNKNOWN_AUDIT_STATUS_META for an unrecognized status string", () => {
    expect(getAuditStatusMeta("queued_legacy")).toEqual(UNKNOWN_AUDIT_STATUS_META);
  });

  it("returns UNKNOWN_AUDIT_STATUS_META for null, undefined, and non-string values", () => {
    expect(getAuditStatusMeta(null)).toEqual(UNKNOWN_AUDIT_STATUS_META);
    expect(getAuditStatusMeta(undefined)).toEqual(UNKNOWN_AUDIT_STATUS_META);
    expect(getAuditStatusMeta(42)).toEqual(UNKNOWN_AUDIT_STATUS_META);
  });
});

describe("isReportReadyStatus", () => {
  it("returns true for complete and partial_complete", () => {
    expect(isReportReadyStatus("complete")).toBe(true);
    expect(isReportReadyStatus("partial_complete")).toBe(true);
  });

  it("returns false for in-progress, failed, and unrecognized statuses", () => {
    expect(isReportReadyStatus("analyzing")).toBe(false);
    expect(isReportReadyStatus("failed")).toBe(false);
    expect(isReportReadyStatus("queued_legacy")).toBe(false);
    expect(isReportReadyStatus(null)).toBe(false);
    expect(isReportReadyStatus(undefined)).toBe(false);
  });
});

describe("safeFormatDate", () => {
  it("formats a valid Date instance", () => {
    expect(safeFormatDate(new Date("2026-04-21T09:00:00.000Z"))).not.toBe("—");
  });

  it("formats a valid date string", () => {
    expect(safeFormatDate("2026-04-21T09:00:00.000Z")).not.toBe("—");
  });

  it("returns a dash for null, undefined, and invalid date values", () => {
    expect(safeFormatDate(null)).toBe("—");
    expect(safeFormatDate(undefined)).toBe("—");
    expect(safeFormatDate("not-a-date")).toBe("—");
    expect(safeFormatDate(new Date("invalid"))).toBe("—");
  });
});
