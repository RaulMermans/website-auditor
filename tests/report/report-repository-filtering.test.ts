import { describe, expect, it, vi } from "vitest";

const { withDbClientMock } = vi.hoisted(() => ({
  withDbClientMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  withDbClient: withDbClientMock,
}));

import { reportRepository } from "@/db/report";

describe("reportRepository accepted-only filtering", () => {
  it("queries accepted findings and accepted-page evidence only", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "run-1",
            project_id: null,
            target_domain_id: "target-1",
            status: "complete",
            homepage_only: false,
            started_at: new Date("2026-04-22T10:00:00.000Z"),
            completed_at: new Date("2026-04-22T10:05:00.000Z"),
            failure_reason: null,
            created_at: new Date("2026-04-22T10:00:00.000Z"),
            domain: "example.com",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "finding-1",
            audit_run_id: "run-1",
            page_snapshot_id: "snapshot-1",
            category: "technical_seo",
            title: "Missing page title",
            description: "No title tag found.",
            severity: "high",
            confidence: "high",
            evidence_level: "Measured",
            evidence_ref: { issueType: "missing_title" },
            recommendation: "Add a title tag.",
            review_status: "accepted",
            review_reason: null,
            created_at: new Date("2026-04-22T10:05:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ category: "technical_seo", key: "title" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            accepted_page_count: "1",
            browser_page_count: "1",
            static_page_count: "0",
            fallback_static_page_count: "0",
            secondary_static_page_count: "0",
            screenshot_page_count: "1",
          },
        ],
      });

    withDbClientMock.mockImplementation(async (callback: any) => callback({ query }));

    const result = await reportRepository.getReportData("run-1");

    expect(result?.findings).toHaveLength(1);
    expect(query.mock.calls[1]?.[0]).toContain("f.review_status = 'accepted'");
    expect(query.mock.calls[1]?.[0]).toContain("ps.page_state = 'accepted'");
    expect(query.mock.calls[2]?.[0]).toContain("ps.page_state = 'accepted'");
    expect(query.mock.calls[3]?.[0]).toContain("page_state = 'accepted'");
    expect(result?.captureFidelity).toMatchObject({
      acceptedPageCount: 1,
      browserPageCount: 1,
      screenshotPageCount: 1,
      hasBrowserEvidence: true,
      primaryFidelity: "rendered_browser",
    });
  });
});
