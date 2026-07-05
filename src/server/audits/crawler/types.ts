import type { BlockerKind } from "@/lib/capture/rendered-capture";
import type { CaptureFidelity } from "@/lib/types";

export const CRAWLER_USER_AGENT = "SiteSignalAuditor";

export type RobotsDirective = "allow" | "disallow";

export type RobotsRule = {
  userAgent: string;
  directive: RobotsDirective;
  path: string;
};

export type RobotsPolicy = {
  fetched: boolean;
  url: string;
  userAgent: string;
  sitemapUrls: string[];
  rules: RobotsRule[];
  error?: string;
};

export type SitemapUrlCandidate = {
  url: string;
  source: "robots_sitemap" | "sitemap_xml" | "sitemap_index";
  sourceSitemapUrl: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
};

export type NormalizedUrl = {
  originalUrl: string;
  normalizedUrl: string;
  hostname: string;
  pathname: string;
  rejected: boolean;
  rejectionReason?: string;
};

export type CrawlSource =
  | "homepage_seed"
  | "robots_sitemap"
  | "sitemap_xml"
  | "sitemap_index"
  | "static_link"
  | "rendered_link"
  | "nav_link"
  | "footer_link"
  | "secondary_static_sweep"
  | "manual_seed";

export type CrawlPageType =
  | "homepage"
  | "services"
  | "product"
  | "pricing"
  | "contact"
  | "about"
  | "case_study"
  | "testimonial"
  | "location"
  | "content"
  | "legal"
  | "other";

export type PageCandidate = {
  url: string;
  normalizedUrl: string;
  source: CrawlSource;
  pageType: CrawlPageType;
  score: number;
  reasons: string[];
};

export type PageEvidenceMetadata = {
  url: string;
  finalUrl?: string;
  pageType: string;
  crawlSource: string;
  crawlScore?: number;
  crawlReasons?: string[];
  captureMethod: "browser" | "static" | "secondary_static" | "failed";
  captureFidelity: CaptureFidelity;
  blockerKind?: BlockerKind | string;
  limitationNote?: string;
};

export type CrawlerFetchResult = {
  html: string;
  statusCode: number;
  ok: boolean;
  finalUrl: string;
};

export type CrawlerFetch = (url: string) => Promise<CrawlerFetchResult>;

export type CrawlerLimits = {
  maxSitemaps: number;
  maxUrlsFromSitemaps: number;
  sitemapFetchTimeoutMs: number;
  maxPagesCaptured: number;
  maxPagesDiscovered: number;
  maxDepth: number;
  maxSamePathFamily: number;
};

export const DEFAULT_CRAWLER_LIMITS: CrawlerLimits = {
  maxSitemaps: 10,
  maxUrlsFromSitemaps: 100,
  sitemapFetchTimeoutMs: 8_000,
  maxPagesCaptured: 5,
  maxPagesDiscovered: 50,
  maxDepth: 2,
  maxSamePathFamily: 2,
};
