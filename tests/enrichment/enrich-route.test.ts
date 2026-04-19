import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportData } from "@/db/report";

const {
  getReportDataMock,
  saveAssetMock,
  buildEnrichmentInputMock,
  generateReportEnrichmentMock,
  generateOutreachAssetsMock,
} = vi.hoisted(() => ({
  getReportDataMock: vi.fn(),
  saveAssetMock: vi.fn(),
  buildEnrichmentInputMock: vi.fn(),
  generateReportEnrichmentMock: vi.fn(),
  generateOutreachAssetsMock: vi.fn(),
}));

vi.mock("@/db/report", () => ({
  reportRepository: {
    getReportData: getReportDataMock,
  },
}));

vi.mock("@/db/enrichment", () => ({
  enrichmentRepository: {
    saveAsset: saveAssetMock,
  },
}));

vi.mock("@/server/audits/generate-report-enrichment", () => ({
  buildEnrichmentInput: buildEnrichmentInputMock,
  generateReportEnrichment: generateReportEnrichmentMock,
}));

vi.mock("@/server/audits/generate-outreach-assets", () => ({
  generateOutreachAssets: generateOutreachAssetsMock,
}));

import { POST } from "@/app/api/reports/[auditRunId]/enrich/route";

function createReportData(): ReportData {
  return {
    auditRunId: "run-123",
    domain: "example.com",
    auditRun: {
      id: "run-123",
      projectId: null,
      targetDomainId: "domain-123",
      status: "complete",
      homepageOnly: false,
      startedAt: new Date("2026-04-18T10:00:00.000Z"),
      completedAt: new Date("2026-04-18T10:10:00.000Z"),
      failureReason: null,
      createdAt: new Date("2026-04-18T09:59:00.000Z"),
    },
    findings: [],
    scores: {
      overall: 75,
      byCategory: {
        performance: 80,
        technical_seo: 70,
        accessibility: 90,
        ux_ui: 100,
        messaging_content: 100,
        conversion: 100,
        trust_signals: 100,
        mobile_experience: 100,
      },
    },
  };
}

describe("POST /api/reports/[auditRunId]/enrich", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buildEnrichmentInputMock.mockReturnValue({
      domain: "example.com",
      homepageOnly: false,
      overallScore: 75,
      categoryScores: {
        performance: 80,
        technical_seo: 70,
        accessibility: 90,
        ux_ui: 100,
        messaging_content: 100,
        conversion: 100,
        trust_signals: 100,
        mobile_experience: 100,
      },
      findingSummaries: [],
      topRecommendations: [],
    });
    saveAssetMock.mockResolvedValue(undefined);
  });

  it("returns 404 when the audit run does not exist", async () => {
    getReportDataMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/reports/run-404/enrich"), {
      params: Promise.resolve({ auditRunId: "run-404" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Audit run not found" });
  });

  it("returns the config response when Gemini is not configured", async () => {
    getReportDataMock.mockResolvedValue(createReportData());
    generateReportEnrichmentMock.mockResolvedValue({ status: "disabled" });
    generateOutreachAssetsMock.mockResolvedValue({ status: "disabled" });

    const response = await POST(new Request("http://localhost/api/reports/run-123/enrich"), {
      params: Promise.resolve({ auditRunId: "run-123" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "LLM enrichment unavailable — GEMINI_API_KEY not configured",
    });
    expect(saveAssetMock).not.toHaveBeenCalled();
  });

  it("persists all generated assets on successful Gemini enrichment", async () => {
    getReportDataMock.mockResolvedValue(createReportData());
    generateReportEnrichmentMock.mockResolvedValue({
      status: "success",
      data: {
        executiveSummary: "Grounded summary.",
        quickWins: "Grounded quick wins.",
      },
    });
    generateOutreachAssetsMock.mockResolvedValue({
      status: "success",
      data: {
        email: "Grounded email.",
        collaboration: "Grounded collaboration.",
        loomScript: "Grounded loom script.",
      },
    });

    const response = await POST(new Request("http://localhost/api/reports/run-123/enrich"), {
      params: Promise.resolve({ auditRunId: "run-123" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      saved: ["summary", "quick_wins", "email", "collaboration", "loom_script"],
    });
    expect(saveAssetMock).toHaveBeenCalledTimes(5);
    expect(saveAssetMock).toHaveBeenNthCalledWith(1, "run-123", "summary", "Grounded summary.");
    expect(saveAssetMock).toHaveBeenNthCalledWith(2, "run-123", "quick_wins", "Grounded quick wins.");
    expect(saveAssetMock).toHaveBeenNthCalledWith(3, "run-123", "email", "Grounded email.");
    expect(saveAssetMock).toHaveBeenNthCalledWith(
      4,
      "run-123",
      "collaboration",
      "Grounded collaboration."
    );
    expect(saveAssetMock).toHaveBeenNthCalledWith(
      5,
      "run-123",
      "loom_script",
      "Grounded loom script."
    );
  });

  it("returns a truthful provider failure response when Gemini is configured but generation fails", async () => {
    getReportDataMock.mockResolvedValue(createReportData());
    generateReportEnrichmentMock.mockResolvedValue({
      status: "error",
      message: "Gemini upstream timeout",
    });
    generateOutreachAssetsMock.mockResolvedValue({
      status: "error",
      message: "Gemini upstream timeout",
    });

    const response = await POST(new Request("http://localhost/api/reports/run-123/enrich"), {
      params: Promise.resolve({ auditRunId: "run-123" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "LLM enrichment failed — Gemini provider/runtime error",
    });
    expect(saveAssetMock).not.toHaveBeenCalled();
  });
});
