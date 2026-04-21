import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildCategoryReviews, type ReportData } from "@/db/report";
import {
  CATEGORY_EXPECTED_KEYS,
  scoreAuditByCategory,
} from "@/server/scoring/score-audit";

const { getReportDataMock, notFoundMock } = vi.hoisted(() => ({
  getReportDataMock: vi.fn(),
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

import FullReportPage from "@/app/report/[auditRunId]/full/page";

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
      title: "Homepage value proposition is still too generic above the fold",
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

describe("FullReportPage", () => {
  it("renders the document-style full report sections", async () => {
    getReportDataMock.mockResolvedValue(makeReportData());

    const element = await FullReportPage({
      params: Promise.resolve({ auditRunId: "run-1" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Executive Summary");
    expect(html).toContain("Top Priorities");
    expect(html).toContain("Score Summary");
    expect(html).toContain("Category-by-Category Review");
    expect(html).toContain("Strategic Readout");
    expect(html).toContain("Recommended Next Actions");
    expect(html).toContain("Appendix / Evidence Notes");
    expect(html).toContain("Homepage value proposition is still too generic above the fold");
  });

  it("delegates to notFound when the audit run is missing", async () => {
    getReportDataMock.mockResolvedValue(null);

    await expect(
      FullReportPage({
        params: Promise.resolve({ auditRunId: "missing-run" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});
