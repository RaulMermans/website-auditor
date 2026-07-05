import { describe, expect, it } from "vitest";
import {
  discoverSitemapUrlCandidates,
  parseSitemapIndexXml,
  parseSitemapXml,
} from "@/server/audits/crawler/sitemap";
import type { CrawlerFetch } from "@/server/audits/crawler/types";

function makeFetcher(responses: Record<string, string | null>): CrawlerFetch {
  return async (url) => {
    const body = responses[url];
    return {
      html: body ?? "",
      statusCode: body === null ? 404 : 200,
      ok: body !== null && body !== undefined,
      finalUrl: url,
    };
  };
}

describe("sitemap discovery", () => {
  it("parses a regular sitemap", () => {
    const candidates = parseSitemapXml(
      [
        "<urlset>",
        "<url><loc>https://example.com/services</loc><lastmod>2026-01-01</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>",
        "</urlset>",
      ].join(""),
      "https://example.com/sitemap.xml",
      "sitemap_xml"
    );

    expect(candidates[0]).toMatchObject({
      url: "https://example.com/services",
      lastmod: "2026-01-01",
      changefreq: "weekly",
      priority: 0.8,
      sourceSitemapUrl: "https://example.com/sitemap.xml",
    });
  });

  it("parses a sitemap index", () => {
    expect(
      parseSitemapIndexXml(
        "<sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>"
      )
    ).toEqual([{ loc: "https://example.com/pages.xml", lastmod: undefined }]);
  });

  it("caps nested sitemap depth", async () => {
    const candidates = await discoverSitemapUrlCandidates({
      baseUrl: "https://example.com/",
      robotsSitemapUrls: ["https://example.com/root.xml"],
      fetcher: makeFetcher({
        "https://example.com/root.xml":
          "<sitemapindex><sitemap><loc>https://example.com/nested.xml</loc></sitemap></sitemapindex>",
        "https://example.com/nested.xml":
          "<sitemapindex><sitemap><loc>https://example.com/deeper.xml</loc></sitemap></sitemapindex>",
        "https://example.com/deeper.xml":
          "<urlset><url><loc>https://example.com/contact</loc></url></urlset>",
        "https://example.com/sitemap.xml": null,
        "https://example.com/sitemap_index.xml": null,
      }),
      limits: { maxDepth: 1 },
    });

    expect(candidates).toEqual([]);
  });

  it("caps URL count and dedupes duplicate sitemap URLs", async () => {
    const candidates = await discoverSitemapUrlCandidates({
      baseUrl: "https://example.com/",
      robotsSitemapUrls: ["https://example.com/sitemap.xml", "https://example.com/sitemap.xml"],
      fetcher: makeFetcher({
        "https://example.com/sitemap.xml": [
          "<urlset>",
          "<url><loc>https://example.com/services</loc></url>",
          "<url><loc>https://example.com/services</loc></url>",
          "<url><loc>https://example.com/contact</loc></url>",
          "</urlset>",
        ].join(""),
        "https://example.com/sitemap_index.xml": null,
      }),
      limits: { maxUrlsFromSitemaps: 1 },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toBe("https://example.com/services");
  });

  it("handles invalid XML safely", async () => {
    const candidates = await discoverSitemapUrlCandidates({
      baseUrl: "https://example.com/",
      fetcher: makeFetcher({
        "https://example.com/sitemap.xml": "not xml",
        "https://example.com/sitemap_index.xml": null,
      }),
    });

    expect(candidates).toEqual([]);
  });
});
