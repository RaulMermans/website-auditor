import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environment validation", () => {
  it("requires WORKER_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    Reflect.deleteProperty(process.env, "WORKER_SECRET");
    vi.stubEnv("AUDIT_API_KEY", "auditapikeyvalue123");

    expect(() => getEnv()).toThrow(/WORKER_SECRET is required in production/);
  });

  it("requires AUDIT_API_KEY in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKER_SECRET", "supersecretvalue1234");
    Reflect.deleteProperty(process.env, "AUDIT_API_KEY");

    expect(() => getEnv()).toThrow(/AUDIT_API_KEY is required in production/);
  });

  it("requires BLOB_READ_WRITE_TOKEN for Vercel Blob in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKER_SECRET", "supersecretvalue1234");
    vi.stubEnv("AUDIT_API_KEY", "auditapikeyvalue123");
    vi.stubEnv("STORAGE_PROVIDER", "vercel_blob");
    Reflect.deleteProperty(process.env, "BLOB_READ_WRITE_TOKEN");

    expect(() => getEnv()).toThrow(/BLOB_READ_WRITE_TOKEN is required/);
  });

  it("allows missing WORKER_SECRET outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    Reflect.deleteProperty(process.env, "WORKER_SECRET");
    Reflect.deleteProperty(process.env, "AUDIT_API_KEY");

    expect(() => getEnv()).not.toThrow();
  });

  it("allows missing production runtime secrets during Next production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    Reflect.deleteProperty(process.env, "WORKER_SECRET");
    Reflect.deleteProperty(process.env, "AUDIT_API_KEY");

    expect(() => getEnv()).not.toThrow();
  });
});
