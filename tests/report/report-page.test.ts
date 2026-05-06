import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildCategoryReviews, type ReportData } from "@/db/report";
import {
  CATEGORY_EXPECTED_KEYS,
  scoreAuditByCategory,
} from "@/server/scoring/score-audit";

vi.mock("@/db/client", () => ({
  withDbClient: vi.fn(),
}));

const {
  getReportDataMock,
  getAssetsForAuditRunMock,
  getProspectIntelligenceMock,
  notFoundMock,
} = vi.hoisted(() => ({
  getReportDataMock: vi.fn(),
  getAssetsForAuditRunMock: vi.fn(),
  getProspectIntelligenceMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
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

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/db/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/report")>();

  return {
    ...actual,
    reportRepository: {
      getReportData: getReportDataMock,
    },
  };
});

vi.mock("@/db/enrichment", () => ({
  enrichmentRepository: {
    getAssetsForAuditRun: getAssetsForAuditRunMock,
  },
}));

vi.mock("@/db/prospect-intelligence", () => ({
  prospectIntelligenceRepository: {
    getForAuditRun: getProspectIntelligenceMock,
  },
}));

import ReportPage from "@/app/report/[auditRunId]/page";

vi.stubGlobal("React", React);

const now = new Date("2026-04-21T09:00:00.000Z");

function makeReportData(): ReportData {
  const findings: ReportData["findings"] = [
    {
      id: "f1",
      auditRunId: "run-1",
      pageSnapshotId: "s1",
      category: "technical_seo",
      title: "Missing page title",
      description:
        "The captured HTML does not include a non-empty <title> tag, so the page is missing one of its core search and browser labels.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceRef: {
        pageUrl: "https://example.com/",
        pageType: "homepage",
        pageCount: 1,
        evidenceKeys: ["title"],
      },
      recommendation:
        "Write a unique <title> tag that states the page topic clearly and distinguishes it from the rest of the site.",
      createdAt: now,
    },
    {
      id: "f2",
      auditRunId: "run-1",
      pageSnapshotId: "s1",
      category: "messaging_content",
      title: "Homepage opening message stays broad above the fold",
      description:
        "The homepage hero copy stays broad and only loosely aligns with the title/meta language in the captured page.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceRef: {
        pageUrl: "https://example.com/",
        pageType: "homepage",
        pageCount: 1,
        evidenceKeys: ["messaging_quality", "messaging_alignment"],
      },
      recommendation:
        "Rewrite the hero so the first screen names the audience, the offer, and the practical outcome before supporting sections begin.",
      createdAt: now,
    },
  ];

  const scores = scoreAuditByCategory(findings, {
    inspectionKeysByCategory: {
      technical_seo: CATEGORY_EXPECTED_KEYS.technical_seo,
      accessibility: CATEGORY_EXPECTED_KEYS.accessibility,
      messaging_content: CATEGORY_EXPECTED_KEYS.messaging_content,
    },
  });

  return {
    auditRunId: "run-1",
    domain: "example.com",
    auditRun: {
      id: "run-1",
      projectId: null,
      targetDomainId: "target-1",
      status: "complete",
      homepageOnly: false,
      startedAt: now,
      completedAt: now,
      failureReason: null,
      createdAt: now,
    },
    findings,
    topPriorities: findings,
    scores,
    categoryReviews: buildCategoryReviews(findings, scores),
  };
}

describe("ReportPage", () => {
  it("renders the concise report hierarchy and enrichment section", async () => {
    getReportDataMock.mockResolvedValue(makeReportData());
    getProspectIntelligenceMock.mockResolvedValue(null);
    getAssetsForAuditRunMock.mockResolvedValue([
      {
        id: "asset-1",
        auditRunId: "run-1",
        type: "summary",
        content: "Deterministic summary copy.",
        generatedAt: now,
      },
    ]);

    const element = await ReportPage({
      params: Promise.resolve({ auditRunId: "run-1" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Main Conclusion");
    expect(html).toContain("Do First");
    expect(html).toContain("Top Priorities");
    expect(html).toContain("Score Summary");
    expect(html).toContain("Category Review");
    expect(html).toContain("Evidence Notes");
    expect(html).toContain("AI Enrichment");
    expect(html).toContain("Homepage opening message stays broad above the fold");
  });

  it("renders partial/static reports with explicit limitation notes", async () => {
    getReportDataMock.mockResolvedValue({
      ...makeReportData(),
      auditRun: {
        ...makeReportData().auditRun,
        status: "partial_complete",
        limitationNote:
          "Browser capture was blocked or degraded by a security challenge. This audit continued using public HTML/static evidence only, so it may not include rendered, protected, or post-hydration page states.",
      },
    });
    getProspectIntelligenceMock.mockResolvedValue(null);
    getAssetsForAuditRunMock.mockResolvedValue([]);

    const element = await ReportPage({
      params: Promise.resolve({ auditRunId: "run-1" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Main Conclusion");
    expect(html).toContain("Partial/static report");
    expect(html).toContain("Capture limitation");
    expect(html).toContain("public HTML/static evidence only");
  });


  it("delegates to notFound when the audit run is missing", async () => {
    getReportDataMock.mockResolvedValue(null);
    getProspectIntelligenceMock.mockResolvedValue(null);
    getAssetsForAuditRunMock.mockResolvedValue([]);

    await expect(
      ReportPage({
        params: Promise.resolve({ auditRunId: "missing-run" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("renders a status view instead of report narrative for failed runs", async () => {
    getReportDataMock.mockResolvedValue({
      ...makeReportData(),
      auditRun: {
        ...makeReportData().auditRun,
        status: "failed",
        failureReason:
          "The target denied this audit request. That does not prove the site is broken for regular visitors.",
        failureKind: "access_denied",
        failureStage: "discover",
        failureDetails: {
          source: "target",
          marker: "http_403",
          retryable: false,
        },
        limitationNote:
          "This audit was completed using accessible public secondary pages and static technical evidence only.",
      },
    });
    getProspectIntelligenceMock.mockResolvedValue(null);
    getAssetsForAuditRunMock.mockResolvedValue([]);

    const element = await ReportPage({
      params: Promise.resolve({ auditRunId: "run-1" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Audit Run Status");
    expect(html).toContain("Access denied by target");
    expect(html).not.toContain("Capture limitation");
    expect(html).not.toContain("completed using accessible public secondary pages");
    expect(html).not.toContain("Main Conclusion");
  });
});
