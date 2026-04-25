import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportData } from "@/db/report";
import type { FullReportData } from "@/server/audits/build-full-report";

const { getReportDataMock, buildFullReportDataMock, buildAiContextPackMock, buildPdfHtmlMock } =
  vi.hoisted(() => ({
    getReportDataMock: vi.fn(),
    buildFullReportDataMock: vi.fn(),
    buildAiContextPackMock: vi.fn(),
    buildPdfHtmlMock: vi.fn(),
  }));

vi.mock("@/db/report", () => ({
  reportRepository: {
    getReportData: getReportDataMock,
  },
}));

vi.mock("@/server/audits/build-full-report", () => ({
  buildFullReportData: buildFullReportDataMock,
}));

vi.mock("@/server/audits/build-ai-context-pack", () => ({
  buildAiContextPack: buildAiContextPackMock,
}));

vi.mock("@/server/audits/build-pdf-html", () => ({
  buildPdfHtml: buildPdfHtmlMock,
}));

// Mock the Chromium/Playwright dynamic imports used by the route's renderPdf
vi.mock("@sparticuz/chromium", () => ({
  default: {
    setGraphicsMode: false,
    args: ["--headless"],
    executablePath: vi.fn().mockResolvedValue("/tmp/chromium"),
  },
}));

const mockPdfPage = {
  setContent: vi.fn().mockResolvedValue(undefined),
  pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 mock")),
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPdfPage),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("playwright-core", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

import { GET } from "@/app/api/reports/[auditRunId]/pdf/route";

function makeParams(auditRunId: string) {
  return { params: Promise.resolve({ auditRunId }) };
}

function makeReportData(overrides?: Partial<ReportData["auditRun"]>): ReportData {
  const now = new Date("2026-04-21T09:00:00Z");
  return {
    auditRunId: "run-1",
    domain: "example.com",
    auditRun: {
      id: "run-1",
      projectId: null,
      targetDomainId: "td-1",
      status: "complete",
      homepageOnly: false,
      startedAt: now,
      completedAt: now,
      failureReason: null,
      createdAt: now,
      ...overrides,
    },
    findings: [],
    topPriorities: [],
    scores: {
      overall: 72,
      byCategory: {
        performance: 80,
        technical_seo: 70,
        accessibility: 90,
        ux_ui: 0,
        messaging_content: 95,
        conversion: 95,
        trust_signals: 95,
        mobile_experience: 95,
      },
      inspectedCategories: ["performance", "technical_seo", "accessibility"],
      inspectionSummaryByCategory: {} as Record<string, never>,
    },
    categoryReviews: [],
  };
}

function makeFullReport(): FullReportData {
  return {
    auditRunId: "run-1",
    domain: "example.com",
    executiveSummary: {
      overview: "Overview text",
      whatIsWorking: [],
      whatIsLimiting: [],
      inspectionFrame: "Frame text",
    },
    topPriorities: [],
    topPriorityGroups: [],
    scoreSummary: {
      overall: 72,
      inspectedCleanCategories: [],
      lightlyInspectedCategories: [],
      insufficientEvidenceCategories: [],
    },
    categorySections: [],
    strategicReadout: [],
    nextActions: { quickWins: [], mediumPriority: [], strategic: [] },
    appendix: {
      scopeNote: "Homepage only",
      evidenceCounts: { Measured: 5, Observed: 3, Inferred: 2 },
      severityCounts: { critical: 0, high: 2, medium: 1, low: 0 },
      inspectionNotes: [],
    },
  } as unknown as FullReportData;
}

describe("GET /api/reports/[auditRunId]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildFullReportDataMock.mockReturnValue(makeFullReport());
    buildAiContextPackMock.mockReturnValue("AI context pack text");
    buildPdfHtmlMock.mockReturnValue("<html><body>Report</body></html>");
  });

  it("returns 404 when audit run is not found", async () => {
    getReportDataMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), makeParams("missing-run"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.stringContaining("not found") });
  });

  it("returns 409 when audit run is not complete", async () => {
    getReportDataMock.mockResolvedValue(makeReportData({ status: "capturing" }));

    const res = await GET(new Request("http://localhost"), makeParams("run-1"));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.stringContaining("not yet complete") });
  });

  it("returns a PDF with correct content-type and content-disposition", async () => {
    getReportDataMock.mockResolvedValue(makeReportData());

    const res = await GET(new Request("http://localhost"), makeParams("run-1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("example.com");
    expect(disposition).toMatch(/\.pdf"/);
  });

  it("includes AI context pack in the generated HTML", async () => {
    getReportDataMock.mockResolvedValue(makeReportData());
    buildAiContextPackMock.mockReturnValue("PORTABLE CONTEXT TEXT");

    await GET(new Request("http://localhost"), makeParams("run-1"));

    expect(buildPdfHtmlMock).toHaveBeenCalledWith(
      expect.anything(),
      "PORTABLE CONTEXT TEXT"
    );
  });

  it("calls buildFullReportData with the report data", async () => {
    const reportData = makeReportData();
    getReportDataMock.mockResolvedValue(reportData);

    await GET(new Request("http://localhost"), makeParams("run-1"));

    expect(buildFullReportDataMock).toHaveBeenCalledWith(reportData);
  });
});
