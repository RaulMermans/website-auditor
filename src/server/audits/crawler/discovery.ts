import type { BrowserDiscoveredLink } from "@/server/browser/types";
import {
  DEFAULT_CRAWLER_LIMITS,
  type CrawlSource,
  type CrawlerFetch,
  type CrawlerLimits,
  type PageCandidate,
} from "@/server/audits/crawler/types";
import { discoverSitemapUrlCandidates } from "@/server/audits/crawler/sitemap";
import { fetchRobotsPolicy, isUrlAllowedByRobots } from "@/server/audits/crawler/robots";
import { normalizeAuditUrl } from "@/server/audits/crawler/url-normalization";
import {
  describeCandidateForSnapshot,
  scorePageCandidate,
  selectPageCandidates,
} from "@/server/audits/crawler/page-scoring";

const HREF_PATTERN = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
const NAV_CONTEXT_PATTERN = /<(nav|header)\b/i;
const FOOTER_CONTEXT_PATTERN = /<footer\b/i;

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function inferLinkSource(linkContext: string, fallback: CrawlSource): CrawlSource {
  const context = linkContext.toLowerCase();
  if (NAV_CONTEXT_PATTERN.test(context)) return "nav_link";
  if (FOOTER_CONTEXT_PATTERN.test(context)) return "footer_link";
  return fallback;
}

export function extractLinksFromHtmlWithSource(
  html: string,
  baseUrl: string,
  fallbackSource: CrawlSource
): Array<{ href: string; text: string; source: CrawlSource }> {
  const links: Array<{ href: string; text: string; source: CrawlSource }> = [];

  for (const match of html.matchAll(HREF_PATTERN)) {
    const href = match[1] ?? match[2] ?? match[3];
    if (!href) continue;

    try {
      const contextStart = Math.max(0, match.index - 300);
      const linkContext = html.slice(contextStart, match.index + match[0].length);
      links.push({
        href: new URL(href, baseUrl).href,
        text: stripTags(match[4] ?? ""),
        source: inferLinkSource(linkContext, fallbackSource),
      });
    } catch {
      // Ignore malformed hrefs; URL normalization records rejected full candidates downstream.
    }
  }

  return links;
}

function addCandidate(
  candidates: PageCandidate[],
  input: {
    url: string;
    baseUrl: string;
    source: CrawlSource;
    linkText?: string;
    sitemapPriority?: number;
    sitemapLastmod?: string;
  }
) {
  const normalized = normalizeAuditUrl(input.url, input.baseUrl);
  if (normalized.rejected) return;

  candidates.push(
    scorePageCandidate({
      url: input.url,
      normalizedUrl: normalized.normalizedUrl,
      source: input.source,
      linkText: input.linkText,
      sitemapPriority: input.sitemapPriority,
      sitemapLastmod: input.sitemapLastmod,
    })
  );
}

export async function discoverAuditPages(options: {
  baseUrl: string;
  fetcher: CrawlerFetch;
  homepageHtml?: string;
  homepageFinalUrl?: string;
  renderedLinks?: BrowserDiscoveredLink[];
  secondaryStaticMode?: boolean;
  limits?: Partial<CrawlerLimits>;
}): Promise<{
  selected: PageCandidate[];
  discovered: PageCandidate[];
  robots: Awaited<ReturnType<typeof fetchRobotsPolicy>>;
}> {
  const limits = { ...DEFAULT_CRAWLER_LIMITS, ...options.limits };
  const baseUrl = new URL(options.homepageFinalUrl ?? options.baseUrl).href;
  const candidates: PageCandidate[] = [];

  addCandidate(candidates, {
    url: baseUrl,
    baseUrl,
    source: "homepage_seed",
  });

  const robots = await fetchRobotsPolicy({ baseUrl, fetcher: options.fetcher });
  const sitemapCandidates = await discoverSitemapUrlCandidates({
    baseUrl,
    robotsSitemapUrls: robots.sitemapUrls,
    fetcher: options.fetcher,
    limits,
  });

  for (const sitemapCandidate of sitemapCandidates) {
    addCandidate(candidates, {
      url: sitemapCandidate.url,
      baseUrl,
      source: sitemapCandidate.source,
      sitemapPriority: sitemapCandidate.priority,
      sitemapLastmod: sitemapCandidate.lastmod,
    });
    if (candidates.length >= limits.maxPagesDiscovered) break;
  }

  if (options.homepageHtml) {
    for (const link of extractLinksFromHtmlWithSource(
      options.homepageHtml,
      baseUrl,
      options.secondaryStaticMode ? "secondary_static_sweep" : "static_link"
    )) {
      addCandidate(candidates, {
        url: link.href,
        baseUrl,
        source: link.source,
        linkText: link.text,
      });
      if (candidates.length >= limits.maxPagesDiscovered) break;
    }
  }

  for (const link of options.renderedLinks ?? []) {
    addCandidate(candidates, {
      url: link.href,
      baseUrl,
      source: "rendered_link",
      linkText: link.text,
    });
    if (candidates.length >= limits.maxPagesDiscovered) break;
  }

  const robotsAllowedCandidates = candidates.filter((candidate) =>
    isUrlAllowedByRobots(candidate.normalizedUrl, robots)
  );
  const selected = selectPageCandidates(robotsAllowedCandidates, limits);

  return {
    selected,
    discovered: robotsAllowedCandidates.slice(0, limits.maxPagesDiscovered),
    robots,
  };
}

export function toSnapshotInputs(candidates: PageCandidate[]) {
  return candidates.map(describeCandidateForSnapshot);
}
