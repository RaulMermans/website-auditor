import { describe, expect, it } from "vitest";
import {
  createBrowserDriver,
  getBrowserDriverConfig,
} from "@/server/browser/create-browser-driver";
import { BrowserUseDriver } from "@/server/browser/browser-use-driver";
import { PlaywrightChromiumDriver } from "@/server/browser/playwright-chromium-driver";

describe("browser driver factory", () => {
  it("defaults to the Playwright driver", () => {
    const driver = createBrowserDriver({
      driver: "playwright",
    });

    expect(driver).toBeInstanceOf(PlaywrightChromiumDriver);
  });

  it("builds the browser-use driver when configured", () => {
    const driver = createBrowserDriver({
      driver: "browser_use",
      browserUseBaseUrl: "https://browser-use.example",
      browserUseApiToken: "test-token",
    });

    expect(driver).toBeInstanceOf(BrowserUseDriver);
  });

  it("rejects browser-use config without a base URL", () => {
    expect(() =>
      createBrowserDriver({
        driver: "browser_use",
      })
    ).toThrow("BROWSER_USE_BASE_URL is required when BROWSER_DRIVER=browser_use");
  });

  it("maps env config into the factory config shape", () => {
    expect(
      getBrowserDriverConfig({
        NODE_ENV: "test",
        DATABASE_URL: undefined,
        PG_BOSS_SCHEMA: undefined,
        WORKER_SECRET: undefined,
        STORAGE_PROVIDER: "local",
        BLOB_READ_WRITE_TOKEN: undefined,
        AUDIT_API_KEY: undefined,
        BROWSER_DRIVER: "browser_use",
        BROWSER_USE_BASE_URL: "https://browser-use.example",
        BROWSER_USE_API_TOKEN: "token-123",
        STORAGE_BUCKET: undefined,
        STORAGE_ACCESS_KEY: undefined,
        STORAGE_SECRET_KEY: undefined,
        GEMINI_API_KEY: undefined,
        GEMINI_MODEL: "gemini-2.5-flash",
        NEXT_PUBLIC_APP_URL: undefined,
      })
    ).toEqual({
      driver: "browser_use",
      browserUseBaseUrl: "https://browser-use.example",
      browserUseApiToken: "token-123",
    });
  });
});
