import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { listRecentAuditRunsMock } = vi.hoisted(() => ({
  listRecentAuditRunsMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

vi.mock("@/app/intake/actions", () => ({
  submitDomainAction: vi.fn(),
}));

vi.mock("@/components/submit-button", () => ({
  SubmitButton: ({ label }: { label: string }) => createElement("button", { type: "submit" }, label),
}));

vi.mock("@/components/intake-success-trigger", () => ({
  IntakeSuccessTrigger: ({ auditRunId, domain }: { auditRunId: string; domain: string }) =>
    createElement("div", { "data-testid": "success-trigger" }, `${domain} ${auditRunId}`),
}));

vi.mock("@/db/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/report")>();

  return {
    ...actual,
    listRecentAuditRuns: listRecentAuditRunsMock,
  };
});

import IntakePage from "@/app/intake/page";

vi.stubGlobal("React", React);

const now = new Date("2026-04-21T09:00:00.000Z");

function makeRun(overrides: Partial<import("@/db/report").AuditRunListItem> = {}) {
  return {
    auditRunId: "run-1",
    domain: "example.com",
    status: "complete" as const,
    createdAt: now,
    completedAt: now,
    homepageOnly: false,
    failureReason: null,
    failureKind: null,
    failureStage: null,
    failureDetails: null,
    limitationNote: null,
    ...overrides,
  };
}

describe("IntakePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the audit form and page header", async () => {
    listRecentAuditRunsMock.mockResolvedValue([]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("SiteSignal Internal");
    expect(html).toContain("Brand audit command center");
    expect(html).toContain("domain");
    expect(html).toContain("Start audit");
  });

  it("renders top-right nav links", async () => {
    listRecentAuditRunsMock.mockResolvedValue([]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("View all audits");
    expect(html).toContain('href="/audits"');
    expect(html).toContain("Logout");
    expect(html).toContain('href="/internal-logout"');
  });

  it("renders recent audits section with runs", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-ready", domain: "ready.example", status: "complete" }),
      makeRun({ auditRunId: "run-proc", domain: "proc.example", status: "analyzing", completedAt: null }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Latest runs");
    expect(html).toContain("ready.example");
    expect(html).toContain("proc.example");
  });

  it("shows View report for report-ready runs", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-ready", domain: "ready.example", status: "complete" }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("View report");
    expect(html).toContain('href="/report/run-ready"');
  });

  it("shows View report for partial_complete runs", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-partial", domain: "partial.example", status: "partial_complete" }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("View report");
    expect(html).toContain('href="/report/run-partial"');
  });

  it("shows View status for in-progress runs", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-proc", domain: "proc.example", status: "capturing", completedAt: null }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("View status");
    expect(html).toContain('href="/report/run-proc"');
  });

  it("shows View status for failed runs", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-fail", domain: "fail.example", status: "failed", failureReason: "Blocked." }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("View status");
    expect(html).toContain('href="/report/run-fail"');
  });

  it("renders empty recent audits state when no runs exist", async () => {
    listRecentAuditRunsMock.mockResolvedValue([]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No audits yet");
    expect(html).not.toContain("View report");
    expect(html).not.toContain("View status");
  });

  it("renders the form and header even when recent audit query fails", async () => {
    listRecentAuditRunsMock.mockRejectedValue(new Error("db unavailable"));

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Brand audit command center");
    expect(html).toContain("Start audit");
    expect(html).toContain("No audits yet");
  });

  it("does not expose raw artifact storage URLs", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-1" }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).not.toMatch(/storage\.googleapis\.com/);
    expect(html).not.toMatch(/blob\.vercel-storage\.com/);
    expect(html).not.toMatch(/s3\.amazonaws\.com/);
  });

  it("does not render the success trigger without a successful submission", async () => {
    listRecentAuditRunsMock.mockResolvedValue([]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain("data-testid=\"success-trigger\"");
  });

  it("renders error banner when error param is present", async () => {
    listRecentAuditRunsMock.mockResolvedValue([]);

    const element = await IntakePage({
      searchParams: Promise.resolve({ error: "Domain is invalid.", auditRunId: "run-x" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Unable to create audit job.");
    expect(html).toContain("Domain is invalid.");
    expect(html).toContain("run-x");
  });

  it("renders success trigger when success=1 and auditRunId are present", async () => {
    listRecentAuditRunsMock.mockResolvedValue([]);

    const element = await IntakePage({
      searchParams: Promise.resolve({
        success: "1",
        auditRunId: "run-success",
        domain: "good.example",
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("data-testid=\"success-trigger\"");
    expect(html).not.toContain("Unable to create audit job.");
  });

  it("renders an Unknown badge instead of crashing for an unrecognized status", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-legacy", domain: "legacy.example", status: "queued_legacy" as never }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("legacy.example");
    expect(html).toContain("Unknown");
    expect(html).toContain("View status");
  });

  it("renders a fallback dash for null or invalid createdAt values", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-null-date", domain: "nulldate.example", createdAt: null as never }),
      makeRun({ auditRunId: "run-bad-date", domain: "baddate.example", createdAt: "not-a-date" as never }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("nulldate.example");
    expect(html).toContain("baddate.example");
    expect(html).toContain("—");
  });

  it("renders malformed recent audit rows defensively without crashing", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-good", domain: "good.example", status: "complete" }),
      makeRun({ auditRunId: "run-no-domain", domain: "" as never, status: "analyzing" }),
      makeRun({ auditRunId: null as never, domain: "ghost.example" }),
    ]);

    const element = await IntakePage({});
    const html = renderToStaticMarkup(element);

    expect(html).toContain("good.example");
    expect(html).toContain("Unknown domain");
    expect(html).not.toContain("ghost.example");
  });
});
