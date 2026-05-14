import { describe, expect, it, vi } from "vitest";

const { withDbClientMock } = vi.hoisted(() => ({
  withDbClientMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  withDbClient: withDbClientMock,
}));

import { GET } from "@/app/api/audits/[auditRunId]/status/route";

describe("GET /api/audits/[auditRunId]/status", () => {
  it("uses blocked-target copy for expected capture-denied failures", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            status: "failed",
            failure_kind: "capture_blocked",
            failure_reason: "The audit reached a security or bot-challenge page.",
            failure_details: {
              source: "target",
              marker: "bot_challenge",
              retryable: false,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ total: "1", accepted: "0", failed: "1", needs_review: "0" }],
      });
    withDbClientMock.mockImplementation(async (callback: any) => callback({ query }));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ auditRunId: "run-blocked-123" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Automated capture was blocked.");
    expect(body.failureKind).toBe("capture_blocked");
    expect(body.reportReady).toBe(false);
  });
});
