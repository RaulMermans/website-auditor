import { describe, expect, it } from "vitest";
import type { AuditRunListItem } from "@/db/report";
import type { AuditStatus } from "@/lib/types";

const now = new Date("2026-04-19T10:00:00.000Z");

function makeListItem(overrides: Partial<AuditRunListItem> = {}): AuditRunListItem {
  return {
    auditRunId: "run-1",
    domain: "example.com",
    status: "complete" as AuditStatus,
    createdAt: now,
    completedAt: now,
    homepageOnly: false,
    failureReason: null,
    ...overrides,
  };
}

describe("AuditRunListItem shape", () => {
  it("carries the expected fields for a complete run", () => {
    const item = makeListItem();
    expect(item.auditRunId).toBe("run-1");
    expect(item.domain).toBe("example.com");
    expect(item.status).toBe("complete");
    expect(item.failureReason).toBeNull();
    expect(item.homepageOnly).toBe(false);
    expect(item.completedAt).toBe(now);
  });

  it("carries failure_reason for failed runs", () => {
    const item = makeListItem({
      status: "failed",
      failureReason: "Playwright Chromium is unavailable in this deployment.",
      completedAt: now,
    });
    expect(item.status).toBe("failed");
    expect(item.failureReason).toMatch(/Playwright Chromium is unavailable/);
  });

  it("completedAt is null for in-progress runs", () => {
    const item = makeListItem({ status: "capturing", completedAt: null });
    expect(item.completedAt).toBeNull();
  });

  it("homepageOnly flag is reflected in the item", () => {
    const item = makeListItem({ homepageOnly: true });
    expect(item.homepageOnly).toBe(true);
  });
});
