import { describe, it, expect } from "vitest";
import { createAuditJob, CreateAuditJobInput } from "@/server/audits/create-audit-job";

describe("createAuditJob", () => {
  it("returns an auditRun in pending status", async () => {
    const result = await createAuditJob({ domain: "example.com" });
    expect(result.auditRun.status).toBe("pending");
    expect(result.auditRun.homepageOnly).toBe(false);
    expect(result.jobId).toBeTruthy();
  });

  it("rejects an invalid domain", () => {
    expect(() => CreateAuditJobInput.parse({ domain: "not a domain!" })).toThrow();
  });
});
