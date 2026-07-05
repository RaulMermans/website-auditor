import { assertPublicUrl } from "@/lib/ssrf";
import {
  DEFAULT_CRAWLER_LIMITS,
  type CrawlerFetch,
  type CrawlerLimits,
  type SitemapUrlCandidate,
} from "@/server/audits/crawler/types";
import { normalizeAuditUrl } from "@/server/audits/crawler/url-normalization";

type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
};

function getTagValue(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "i"));
  return match?.[1]?.trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseSitemapXml(
  xml: string,
  sourceSitemapUrl: string,
  source: SitemapUrlCandidate["source"]
): SitemapUrlCandidate[] {
  const entries: SitemapUrlCandidate[] = [];
  const urlMatches = xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi);

  for (const match of urlMatches) {
    const block = match[1] ?? "";
    const loc = getTagValue(block, "loc");
    if (!loc) continue;

    const priority = Number.parseFloat(getTagValue(block, "priority") ?? "");
    entries.push({
      url: decodeXml(loc),
      source,
      sourceSitemapUrl,
      lastmod: getTagValue(block, "lastmod"),
      changefreq: getTagValue(block, "changefreq"),
      priority: Number.isFinite(priority) ? priority : undefined,
    });
  }

  return entries;
}

export function parseSitemapIndexXml(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const sitemapMatches = xml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi);

  for (const match of sitemapMatches) {
    const block = match[1] ?? "";
    const loc = getTagValue(block, "loc");
    if (!loc) continue;

    entries.push({
      loc: decodeXml(loc),
      lastmod: getTagValue(block, "lastmod"),
    });
  }

  return entries;
}

function looksLikeSitemapIndex(xml: string) {
  return /<sitemapindex\b/i.test(xml);
}

function looksLikeUrlset(xml: string) {
  return /<urlset\b/i.test(xml) || /<url\b/i.test(xml);
}

function uniqueUrls(urls: string[]) {
  return [...new Set(urls.filter(Boolean))];
}

async function fetchSitemapText(fetcher: CrawlerFetch, sitemapUrl: string) {
  await assertPublicUrl(sitemapUrl);
  const result = await fetcher(sitemapUrl);
  if (!result.ok) return null;
  return result.html;
}

export async function discoverSitemapUrlCandidates(options: {
  baseUrl: string;
  robotsSitemapUrls?: string[];
  fetcher: CrawlerFetch;
  limits?: Partial<CrawlerLimits>;
}): Promise<SitemapUrlCandidate[]> {
  const limits = { ...DEFAULT_CRAWLER_LIMITS, ...options.limits };
  const base = new URL(options.baseUrl);
  const directSitemaps = [`${base.origin}/sitemap.xml`, `${base.origin}/sitemap_index.xml`];
  const queue: Array<{ url: string; source: SitemapUrlCandidate["source"]; depth: number }> =
    uniqueUrls([...(options.robotsSitemapUrls ?? []), ...directSitemaps]).map(
    (url) => ({
      url,
      source: (options.robotsSitemapUrls ?? []).includes(url)
        ? "robots_sitemap"
        : url.endsWith("/sitemap_index.xml")
          ? "sitemap_index"
          : "sitemap_xml",
      depth: 0,
    })
  );
  const visitedSitemaps = new Set<string>();
  const seenPageUrls = new Set<string>();
  const candidates: SitemapUrlCandidate[] = [];

  while (
    queue.length > 0 &&
    visitedSitemaps.size < limits.maxSitemaps &&
    candidates.length < limits.maxUrlsFromSitemaps
  ) {
    const item = queue.shift()!;
    const normalized = normalizeAuditUrl(item.url, options.baseUrl);
    if (normalized.rejected || visitedSitemaps.has(normalized.normalizedUrl)) {
      continue;
    }

    visitedSitemaps.add(normalized.normalizedUrl);

    let xml: string | null = null;
    try {
      xml = await fetchSitemapText(options.fetcher, normalized.normalizedUrl);
    } catch {
      xml = null;
    }
    if (!xml) continue;

    if (looksLikeSitemapIndex(xml)) {
      if (item.depth + 1 > limits.maxDepth) {
        continue;
      }

      for (const sitemap of parseSitemapIndexXml(xml)) {
        if (queue.length + visitedSitemaps.size >= limits.maxSitemaps) {
          break;
        }
        queue.push({
          url: sitemap.loc,
          source: "sitemap_index",
          depth: item.depth + 1,
        });
      }
      continue;
    }

    if (!looksLikeUrlset(xml)) {
      continue;
    }

    for (const candidate of parseSitemapXml(xml, normalized.normalizedUrl, item.source)) {
      const normalizedCandidate = normalizeAuditUrl(candidate.url, options.baseUrl);
      if (normalizedCandidate.rejected || seenPageUrls.has(normalizedCandidate.normalizedUrl)) {
        continue;
      }

      seenPageUrls.add(normalizedCandidate.normalizedUrl);
      candidates.push({
        ...candidate,
        url: normalizedCandidate.normalizedUrl,
      });

      if (candidates.length >= limits.maxUrlsFromSitemaps) {
        break;
      }
    }
  }

  return candidates;
}
