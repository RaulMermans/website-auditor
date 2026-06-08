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

vi.mock("@/db/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/report")>();

  return {
    ...actual,
    listRecentAuditRuns: listRecentAuditRunsMock,
  };
});

import AuditsPage from "@/app/audits/page";

vi.stubGlobal("React", React);

const now = new Date("2026-04-21T09:00:00.000Z");

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    auditRunId: "run-1",
    domain: "example.com",
    status: "complete",
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

describe("AuditsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders run cards with clear next actions for complete, in-progress, and failed runs", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      {
        auditRunId: "run-complete",
        domain: "ready.example",
        status: "complete",
        createdAt: now,
        completedAt: now,
        homepageOnly: false,
        failureReason: null,
        failureKind: null,
        failureStage: null,
        failureDetails: null,
        limitationNote: null,
      },
      {
        auditRunId: "run-partial",
        domain: "partial.example",
        status: "partial_complete",
        createdAt: now,
        completedAt: now,
        homepageOnly: true,
        failureReason: null,
        failureKind: null,
        failureStage: null,
        failureDetails: null,
        limitationNote:
          "Browser capture was blocked or degraded by a security challenge. This audit continued using public HTML/static evidence only.",
      },
      {
        auditRunId: "run-progress",
        domain: "working.example",
        status: "analyzing",
        createdAt: now,
        completedAt: null,
        homepageOnly: true,
        failureReason: null,
        failureKind: null,
        failureStage: null,
        failureDetails: null,
        limitationNote: null,
      },
      {
        auditRunId: "run-failed",
        domain: "failed.example",
        status: "failed",
        createdAt: now,
        completedAt: now,
        homepageOnly: false,
        failureReason: "Browser capture failed.",
        failureKind: "unknown",
        failureStage: "capture",
        failureDetails: {
          source: "unknown",
          marker: "unknown",
          retryable: true,
        },
        limitationNote:
          "This audit was completed using accessible public secondary pages and static technical evidence only.",
      },
    ]);

    const element = await AuditsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Audit Runs");
    expect(html).toContain("Reports ready");
    expect(html).toContain("Open concise report");
    expect(html).toContain("Open full report");
    expect(html).toContain("Partial/static report");
    expect(html).toContain("public HTML/static evidence only");
    expect(html).toContain("Assembling findings");
    expect(html).toContain("Homepage-only");
    expect(html).toContain("Capture");
    expect(html).not.toContain("completed using accessible public secondary pages");
  });

  it("renders the empty state with a CTA when no runs exist", async () => {
    listRecentAuditRunsMock.mockResolvedValue([]);

    const element = await AuditsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No audits yet");
    expect(html).toContain('href="/intake"');
    expect(html).toContain("Start an audit");
  });

  it("renders a diagnostic state when the audit list query fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("column ar.failure_kind does not exist") as Error & { code: string };
    error.code = "42703";
    listRecentAuditRunsMock.mockRejectedValue(error);

    const element = await AuditsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Audit runs unavailable");
    expect(html).toContain("database schema is missing expected tables or columns");
    expect(consoleError).toHaveBeenCalledWith(
      "[audits] failed to list audit runs",
      expect.objectContaining({
        code: "42703",
      })
    );
  });

  it("renders an Unknown badge instead of crashing for an unrecognized status", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-legacy", domain: "legacy.example", status: "queued_legacy" }),
    ]);

    const element = await AuditsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("legacy.example");
    expect(html).toContain("Unknown");
    expect(html).toContain(
      "This run reported a status that the report UI does not recognize yet."
    );
  });

  it("renders malformed recent audit rows defensively without crashing", async () => {
    listRecentAuditRunsMock.mockResolvedValue([
      makeRun({ auditRunId: "run-good", domain: "good.example", status: "complete" }),
      makeRun({ auditRunId: "run-no-domain", domain: "", status: "analyzing", completedAt: null }),
      makeRun({ auditRunId: null, domain: "ghost.example", status: "complete" }),
      makeRun({ auditRunId: "run-bad-date", domain: "baddate.example", status: "pending", createdAt: "not-a-date", completedAt: undefined }),
    ]);

    const element = await AuditsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("good.example");
    expect(html).toContain("Unknown domain");
    expect(html).not.toContain("ghost.example");
    expect(html).toContain("baddate.example");
    expect(html).toContain("—");
  });
});
