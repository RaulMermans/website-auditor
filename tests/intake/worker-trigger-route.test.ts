import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("/api/worker/trigger route removal", () => {
  it("route file has been deleted", () => {
    const routePath = resolve(
      __dirname,
      "../../src/app/api/worker/trigger/route.ts"
    );
    expect(existsSync(routePath)).toBe(false);
  });

  it("canonical worker route file exists at /api/worker/process", () => {
    const routePath = resolve(
      __dirname,
      "../../src/app/api/worker/process/route.ts"
    );
    expect(existsSync(routePath)).toBe(true);
  });
});
