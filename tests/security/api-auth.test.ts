import { describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: "test" as "development" | "test" | "production",
    AUDIT_API_KEY: undefined as string | undefined,
  },
}));

vi.mock("@/lib/env", () => ({
  env: envMock,
}));

import { requireAuditApiKey } from "@/lib/api-auth";

describe("requireAuditApiKey", () => {
  it("does not silently open protected routes in production when AUDIT_API_KEY is missing", async () => {
    envMock.NODE_ENV = "production";
    envMock.AUDIT_API_KEY = undefined;

    const response = requireAuditApiKey(new Request("http://localhost/api/reports/run/pdf"));

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({ error: "Server auth is not configured" });
  });

  it("keeps local development convenient when AUDIT_API_KEY is missing", () => {
    envMock.NODE_ENV = "development";
    envMock.AUDIT_API_KEY = undefined;

    expect(requireAuditApiKey(new Request("http://localhost/api/reports/run/pdf"))).toBeNull();
  });
});
