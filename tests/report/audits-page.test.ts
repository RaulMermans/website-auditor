import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

describe("AuditsPage", () => {
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
      },
      {
        auditRunId: "run-progress",
        domain: "working.example",
        status: "analyzing",
        createdAt: now,
        completedAt: null,
        homepageOnly: true,
        failureReason: null,
      },
      {
        auditRunId: "run-failed",
        domain: "failed.example",
        status: "failed",
        createdAt: now,
        completedAt: now,
        homepageOnly: false,
        failureReason: "Browser capture failed.",
      },
    ]);

    const element = await AuditsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Audit Dashboard");
    expect(html).toContain("Reports ready");
    expect(html).toContain("Open concise report");
    expect(html).toContain("Open full report");
    expect(html).toContain("Assembling findings");
    expect(html).toContain("Homepage-only");
    expect(html).toContain("Failure reason");
  });
});
