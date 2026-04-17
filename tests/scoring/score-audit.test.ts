import { describe, it, expect } from "vitest";
import { scoreAudit } from "@/server/scoring/score-audit";

describe("scoreAudit", () => {
  it("returns 100 with no findings", () => {
    const result = scoreAudit({ auditRunId: "a", rubricId: "r", findings: [] });
    expect(result.totalScore).toBe(100);
  });

  it("penalizes critical findings by 20", () => {
    const result = scoreAudit({
      auditRunId: "a",
      rubricId: "r",
      findings: [{ id: "1", severity: "critical" }],
    });
    expect(result.totalScore).toBe(80);
  });

  it("clamps to 0 on extreme penalty", () => {
    const findings = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      severity: "critical" as const,
    }));
    const result = scoreAudit({ auditRunId: "a", rubricId: "r", findings });
    expect(result.totalScore).toBe(0);
  });
});
