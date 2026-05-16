import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("worker-drain GitHub Actions workflow", () => {
  let content: string;

  beforeAll(() => {
    const workflowPath = resolve(
      __dirname,
      "../../.github/workflows/worker-drain.yml"
    );
    content = readFileSync(workflowPath, "utf-8");
  });

  it("workflow file exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("has workflow_dispatch trigger", () => {
    expect(content).toContain("workflow_dispatch:");
  });

  it("does not have a schedule trigger", () => {
    expect(content).not.toMatch(/^\s*schedule:/m);
  });

  it("does not contain a cron expression", () => {
    expect(content).not.toContain("cron:");
  });

  it("uses WORKER_DRAIN_URL secret and sends x-worker-secret header", () => {
    // The endpoint URL is injected via the WORKER_DRAIN_URL secret at runtime.
    expect(content).toContain("WORKER_DRAIN_URL");
    expect(content).toContain("x-worker-secret");
  });
});
