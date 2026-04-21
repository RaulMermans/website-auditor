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
  const scores = {
    overall: 75,
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
    inspectedCategories: [
      "performance",
      "technical_seo",
      "accessibility",
      "messaging_content",
      "conversion",
      "trust_signals",
      "mobile_experience",
    ],
    inspectionSummaryByCategory: {
      performance: { status: "inspected", depth: 1, observedKeys: ["script_count"], expectedKeys: ["script_count"] },
      technical_seo: { status: "inspected", depth: 1, observedKeys: ["title"], expectedKeys: ["title"] },
      accessibility: { status: "inspected", depth: 1, observedKeys: ["image_count"], expectedKeys: ["image_count"] },
      ux_ui: { status: "not_inspected", depth: 0, observedKeys: [], expectedKeys: [] },
      messaging_content: { status: "inspected", depth: 1, observedKeys: ["page_text_flags"], expectedKeys: ["page_text_flags"] },
      conversion: { status: "inspected", depth: 1, observedKeys: ["cta_present"], expectedKeys: ["cta_present"] },
      trust_signals: { status: "inspected", depth: 1, observedKeys: ["trust_signals"], expectedKeys: ["trust_signals"] },
      mobile_experience: { status: "inspected", depth: 1, observedKeys: ["viewport_meta_present"], expectedKeys: ["viewport_meta_present"] },
    },
  } as ReportData["scores"];

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
    topPriorities: [],
    scores,
    categoryReviews: [],
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
        ux_ui: 0,
        messaging_content: 95,
        conversion: 95,
        trust_signals: 95,
        mobile_experience: 95,
      },
      lightlyInspectedCategories: [],
      insufficientEvidenceCategories: ["ux_ui"],
      categoryReviewSummaries: ["ux_ui: Insufficient evidence"],
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
