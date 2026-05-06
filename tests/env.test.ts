import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environment validation", () => {
  it("requires WORKER_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    Reflect.deleteProperty(process.env, "WORKER_SECRET");

    expect(() => getEnv()).toThrow(/WORKER_SECRET is required in production/);
  });

  it("allows missing WORKER_SECRET outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    Reflect.deleteProperty(process.env, "WORKER_SECRET");

    expect(() => getEnv()).not.toThrow();
  });
});
