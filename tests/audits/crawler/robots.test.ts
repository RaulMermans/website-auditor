import { describe, expect, it } from "vitest";
import {
  fetchRobotsPolicy,
  isUrlAllowedByRobots,
  parseRobotsTxt,
} from "@/server/audits/crawler/robots";
import type { CrawlerFetch } from "@/server/audits/crawler/types";

const okFetcher = (body: string, statusCode = 200): CrawlerFetch => async (url) => ({
  html: body,
  statusCode,
  ok: statusCode >= 200 && statusCode < 300,
  finalUrl: url,
});

describe("robots crawler policy", () => {
  it("allows by default when robots.txt is missing", async () => {
    const policy = await fetchRobotsPolicy({
      baseUrl: "https://example.com/",
      fetcher: okFetcher("", 404),
    });

    expect(policy.fetched).toBe(false);
    expect(isUrlAllowedByRobots("https://example.com/private", policy)).toBe(true);
  });

  it("blocks explicitly disallowed URLs", () => {
    const policy = parseRobotsTxt("User-agent: *\nDisallow: /private", "https://example.com/robots.txt");

    expect(isUrlAllowedByRobots("https://example.com/private/page", policy)).toBe(false);
    expect(isUrlAllowedByRobots("https://example.com/public", policy)).toBe(true);
  });

  it("lets a specific allow beat a broader disallow", () => {
    const policy = parseRobotsTxt(
      "User-agent: *\nDisallow: /private\nAllow: /private/public",
      "https://example.com/robots.txt"
    );

    expect(isUrlAllowedByRobots("https://example.com/private/public", policy)).toBe(true);
  });

  it("prefers the specific crawler user-agent over wildcard", () => {
    const policy = parseRobotsTxt(
      [
        "User-agent: *",
        "Disallow: /",
        "User-agent: SiteSignalAuditor",
        "Allow: /",
      ].join("\n"),
      "https://example.com/robots.txt"
    );

    expect(isUrlAllowedByRobots("https://example.com/services", policy)).toBe(true);
  });

  it("extracts sitemap URLs", () => {
    const policy = parseRobotsTxt(
      "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
      "https://example.com/robots.txt"
    );

    expect(policy.sitemapUrls).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("handles malformed robots.txt safely", () => {
    const policy = parseRobotsTxt("not a robots file\nDisallow /private", "https://example.com/robots.txt");

    expect(policy.rules).toEqual([]);
    expect(isUrlAllowedByRobots("https://example.com/private", policy)).toBe(true);
  });
});
