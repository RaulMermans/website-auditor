import { getEnv } from "@/lib/env";
import { BrowserUseDriver } from "@/server/browser/browser-use-driver";
import { PlaywrightChromiumDriver } from "@/server/browser/playwright-chromium-driver";
import type { BrowserDriver, BrowserDriverName } from "@/server/browser/types";

export interface BrowserDriverFactoryConfig {
  driver: BrowserDriverName;
  browserUseBaseUrl?: string;
  browserUseApiToken?: string;
}

export function getBrowserDriverConfig(
  envConfig: ReturnType<typeof getEnv> = getEnv()
): BrowserDriverFactoryConfig {
  return {
    driver: envConfig.BROWSER_DRIVER,
    browserUseBaseUrl: envConfig.BROWSER_USE_BASE_URL,
    browserUseApiToken: envConfig.BROWSER_USE_API_TOKEN,
  };
}

export function createBrowserDriver(config: BrowserDriverFactoryConfig): BrowserDriver {
  if (config.driver === "browser_use") {
    if (!config.browserUseBaseUrl) {
      throw new Error("BROWSER_USE_BASE_URL is required when BROWSER_DRIVER=browser_use");
    }

    return new BrowserUseDriver({
      baseUrl: config.browserUseBaseUrl,
      apiToken: config.browserUseApiToken,
    });
  }

  return new PlaywrightChromiumDriver();
}

export const browserDriver = createBrowserDriver(getBrowserDriverConfig());
