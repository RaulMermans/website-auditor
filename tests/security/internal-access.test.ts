import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, COOKIE_NAME } from "@/lib/access-session";
import { middleware } from "@/middleware";

const TEST_SECRET = "test-cookie-secret-at-least-32-chars-long!!";

function makeRequest(path: string, sessionToken?: string): NextRequest {
  const url = `http://localhost${path}`;
  const headers: HeadersInit = {};
  if (sessionToken) {
    headers["cookie"] = `${COOKIE_NAME}=${sessionToken}`;
  }
  return new NextRequest(url, { headers });
}

describe("internal access middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("public routes — no auth required", () => {
    it("passes / through without a session cookie", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/"));
      expect(res.status).toBe(200);
    });

    it("passes /_next/static assets through", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/_next/static/chunks/main.js"));
      expect(res.status).toBe(200);
    });

    it("passes /favicon.ico through", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/favicon.ico"));
      expect(res.status).toBe(200);
    });

    it("passes /robots.txt through", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/robots.txt"));
      expect(res.status).toBe(200);
    });

    it("passes /internal-login through without a cookie", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/internal-login"));
      expect(res.status).toBe(200);
    });

    it("passes /api/worker/process through — WORKER_SECRET auth lives in the route handler", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/api/worker/process"));
      expect(res.status).toBe(200);
    });
  });

  describe("unauthenticated protected page routes", () => {
    it("redirects /intake to /internal-login", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/intake"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/internal-login");
    });

    it("redirects /audits to /internal-login", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/audits"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/internal-login");
    });

    it("redirects /report/:id to /internal-login", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/report/abc-123"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/internal-login");
    });

    it("redirects /report/:id/full to /internal-login", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/report/abc-123/full"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/internal-login");
    });
  });

  describe("unauthenticated protected API routes", () => {
    it("returns 401 for /api/audits/:id/status", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/api/audits/run-123/status"));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 401 for /api/reports/:id/enrich", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/api/reports/run-123/enrich"));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("returns 401 for /api/reports/:id/pdf", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/api/reports/run-123/pdf"));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    });
  });

  describe("authenticated requests", () => {
    it("allows /intake with a valid session cookie", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const token = await createSessionToken(TEST_SECRET);
      const res = await middleware(makeRequest("/intake", token));
      expect(res.status).toBe(200);
    });

    it("allows /audits with a valid session cookie", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const token = await createSessionToken(TEST_SECRET);
      const res = await middleware(makeRequest("/audits", token));
      expect(res.status).toBe(200);
    });

    it("allows /api/audits/:id/status with a valid session cookie", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const token = await createSessionToken(TEST_SECRET);
      const res = await middleware(makeRequest("/api/audits/run-123/status", token));
      expect(res.status).toBe(200);
    });

    it("rejects a forged session token on a protected page", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const res = await middleware(makeRequest("/intake", "forged.token"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/internal-login");
    });

    it("rejects a token signed with a different secret", async () => {
      vi.stubEnv("INTERNAL_ACCESS_COOKIE_SECRET", TEST_SECRET);
      const token = await createSessionToken("different-secret-also-32-chars-xxxx");
      const res = await middleware(makeRequest("/intake", token));
      expect(res.status).toBe(307);
    });
  });

  describe("dev/test mode — no INTERNAL_ACCESS_COOKIE_SECRET", () => {
    it("allows protected page routes when secret is not configured (dev convenience)", async () => {
      // NODE_ENV is 'test' in vitest — treated like development
      const res = await middleware(makeRequest("/intake"));
      expect(res.status).toBe(200);
    });

    it("allows protected API routes when secret is not configured (dev convenience)", async () => {
      const res = await middleware(makeRequest("/api/audits/run-123/status"));
      expect(res.status).toBe(200);
    });
  });
});

describe("session token utilities", () => {
  it("creates and verifies a valid token", async () => {
    const secret = "super-secret-32-chars-minimum-xxx";
    const token = await createSessionToken(secret);
    const { verifySessionToken } = await import("@/lib/access-session");
    await expect(verifySessionToken(token, secret)).resolves.toBe(true);
  });

  it("rejects a token verified with a wrong secret", async () => {
    const { verifySessionToken } = await import("@/lib/access-session");
    const token = await createSessionToken("secret-a-at-least-32-chars-long!!");
    await expect(verifySessionToken(token, "secret-b-at-least-32-chars-long!!")).resolves.toBe(false);
  });

  it("rejects a malformed token", async () => {
    const { verifySessionToken } = await import("@/lib/access-session");
    await expect(verifySessionToken("not-a-valid-token", "secret-32-chars-minimum-here!!")).resolves.toBe(false);
  });

  it("rejects an empty string", async () => {
    const { verifySessionToken } = await import("@/lib/access-session");
    await expect(verifySessionToken("", "secret-32-chars-minimum-here!!")).resolves.toBe(false);
  });
});
