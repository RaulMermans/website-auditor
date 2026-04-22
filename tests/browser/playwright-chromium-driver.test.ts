import { describe, expect, it } from "vitest";
import { normalizePlaywrightChromiumLaunchError } from "@/server/browser/playwright-chromium-driver";

describe("normalizePlaywrightChromiumLaunchError", () => {
  it("adds deployment guidance for missing Chromium binaries", () => {
    const error = normalizePlaywrightChromiumLaunchError(
      new Error("browserType.launch: Executable doesn't exist at /var/task/.cache/ms-playwright/chromium")
    );

    expect(error.message).toMatch(/Playwright Chromium is unavailable in this deployment/);
    expect(error.message).toMatch(/Executable doesn't exist/);
  });

  it("adds concurrency guidance for ETXTBSY errors", () => {
    const error = normalizePlaywrightChromiumLaunchError(
      new Error("spawn ETXTBSY /tmp/chromium")
    );

    expect(error.message).toMatch(/Chromium binary busy/);
    expect(error.message).toMatch(/ETXTBSY/);
  });
});
