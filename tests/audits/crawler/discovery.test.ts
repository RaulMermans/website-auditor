import { describe, expect, it } from "vitest";
import { discoverAuditPages } from "@/server/audits/crawler/discovery";
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

describe("crawler discovery workflow", () => {
  it("feeds sitemap candidates into page selection", async () => {
    const result = await discoverAuditPages({
      baseUrl: "https://example.com/",
      fetcher: makeFetcher({
        "https://example.com/robots.txt": "Sitemap: https://example.com/sitemap.xml",
        "https://example.com/sitemap.xml":
          "<urlset><url><loc>https://example.com/services</loc></url></urlset>",
        "https://example.com/sitemap_index.xml": null,
      }),
    });

    expect(result.selected.map((candidate) => candidate.normalizedUrl)).toContain(
      "https://example.com/services"
    );
    expect(result.selected.find((candidate) => candidate.normalizedUrl.endsWith("/services"))?.source).toBe(
      "robots_sitemap"
    );
  });

  it("feeds static homepage links into page selection", async () => {
    const result = await discoverAuditPages({
      baseUrl: "https://example.com/",
      homepageHtml:
        '<html><body><nav><a href="/contact">Contact</a></nav><a href="/blog">Blog</a></body></html>',
      fetcher: makeFetcher({
        "https://example.com/robots.txt": null,
        "https://example.com/sitemap.xml": null,
        "https://example.com/sitemap_index.xml": null,
      }),
    });

    const contact = result.selected.find((candidate) => candidate.normalizedUrl.endsWith("/contact"));
    expect(contact?.source).toBe("nav_link");
  });

  it("feeds rendered links into page selection when browser evidence exists", async () => {
    const result = await discoverAuditPages({
      baseUrl: "https://example.com/",
      renderedLinks: [
        {
          href: "https://example.com/pricing",
          origin: "https://example.com",
          pathname: "/pricing",
          text: "Pricing",
        },
      ],
      fetcher: makeFetcher({
        "https://example.com/robots.txt": null,
        "https://example.com/sitemap.xml": null,
        "https://example.com/sitemap_index.xml": null,
      }),
    });

    expect(result.selected.find((candidate) => candidate.normalizedUrl.endsWith("/pricing"))?.source).toBe(
      "rendered_link"
    );
  });

  it("labels blocked-homepage secondary static discovery", async () => {
    const result = await discoverAuditPages({
      baseUrl: "https://example.com/",
      secondaryStaticMode: true,
      homepageHtml: '<html><body><a href="/about">About</a></body></html>',
      fetcher: makeFetcher({
        "https://example.com/robots.txt": null,
        "https://example.com/sitemap.xml": null,
        "https://example.com/sitemap_index.xml": null,
      }),
    });

    expect(result.selected.find((candidate) => candidate.normalizedUrl.endsWith("/about"))?.source).toBe(
      "secondary_static_sweep"
    );
  });

  it("respects robots disallow and crawl budgets", async () => {
    const result = await discoverAuditPages({
      baseUrl: "https://example.com/",
      homepageHtml:
        '<html><body><a href="/private">Private</a><a href="/contact">Contact</a><a href="/pricing">Pricing</a></body></html>',
      fetcher: makeFetcher({
        "https://example.com/robots.txt": "User-agent: *\nDisallow: /private",
        "https://example.com/sitemap.xml": null,
        "https://example.com/sitemap_index.xml": null,
      }),
      limits: { maxPagesCaptured: 2, maxPagesDiscovered: 3 },
    });

    expect(result.discovered.length).toBeLessThanOrEqual(3);
    expect(result.selected).toHaveLength(2);
    expect(result.selected.map((candidate) => candidate.normalizedUrl)).not.toContain(
      "https://example.com/private"
    );
  });
});
