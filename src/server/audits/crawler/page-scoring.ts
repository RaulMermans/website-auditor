import type { PageType } from "@/lib/types";
import {
  DEFAULT_CRAWLER_LIMITS,
  type CrawlPageType,
  type CrawlerLimits,
  type CrawlSource,
  type PageCandidate,
} from "@/server/audits/crawler/types";

const EXCLUDED_PATH_PATTERN =
  /\/(?:account|admin|auth|basket|cart|checkout|dashboard|login|logout|my-account|order|orders|password|register|reset|search|signin|sign-in|signup|sign-up|user|users|wp-admin)(?:\/|$)/i;
const LOW_PRIORITY_PATTERN =
  /\/(?:blog|blogs|news|resources|articles|careers|jobs|legal|privacy|terms|cookies?|tag|tags|category|author)(?:\/|$)/i;

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function getPathSegments(url: string) {
  return new URL(url).pathname.split("/").filter(Boolean);
}

function getPathFamily(url: string) {
  const segments = getPathSegments(url);
  return segments[0]?.toLowerCase() ?? "/";
}

export function classifyCrawlPageType(url: string): CrawlPageType {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();
  const normalized = path.replace(/[-_]/g, " ");

  if (path === "/" || path === "/home") return "homepage";
  if (includesAny(normalized, ["privacy", "terms", "cookie", "legal", "gdpr"])) return "legal";
  if (includesAny(normalized, ["case stud", "success stor", "portfolio", "work"])) {
    return "case_study";
  }
  if (includesAny(normalized, ["testimonial", "review", "customers"])) return "testimonial";
  if (includesAny(normalized, ["location", "locations", "areas served", "stores"])) return "location";
  if (includesAny(normalized, ["pricing", "plans", "price", "cost"])) return "pricing";
  if (includesAny(normalized, ["contact", "book", "booking", "demo", "quote", "schedule"])) {
    return "contact";
  }
  if (includesAny(normalized, ["product", "products", "platform", "software", "features"])) {
    return "product";
  }
  if (includesAny(normalized, ["service", "services", "solution", "solutions", "capabilities"])) {
    return "services";
  }
  if (includesAny(normalized, ["about", "company", "team", "mission", "who we are"])) return "about";
  if (LOW_PRIORITY_PATTERN.test(path)) return "content";

  return "other";
}

export function toSnapshotPageType(pageType: CrawlPageType): PageType {
  if (pageType === "case_study" || pageType === "testimonial" || pageType === "location") {
    return "content";
  }
  return pageType;
}

function sourceWeight(source: CrawlSource) {
  switch (source) {
    case "homepage_seed":
      return 1_000;
    case "nav_link":
      return 80;
    case "rendered_link":
      return 70;
    case "static_link":
      return 60;
    case "robots_sitemap":
    case "sitemap_xml":
    case "sitemap_index":
      return 45;
    case "footer_link":
      return 20;
    case "secondary_static_sweep":
      return 40;
    case "manual_seed":
      return 90;
  }
}

function pageTypeWeight(pageType: CrawlPageType) {
  switch (pageType) {
    case "homepage":
      return 1_000;
    case "contact":
      return 170;
    case "services":
      return 160;
    case "product":
      return 150;
    case "pricing":
      return 145;
    case "about":
      return 120;
    case "case_study":
    case "testimonial":
    case "location":
      return 95;
    case "content":
      return 30;
    case "legal":
      return -120;
    case "other":
      return 10;
  }
}

export function scorePageCandidate(input: {
  url: string;
  normalizedUrl: string;
  source: CrawlSource;
  linkText?: string;
  sitemapPriority?: number;
  sitemapLastmod?: string;
}): PageCandidate {
  const pageType = classifyCrawlPageType(input.normalizedUrl);
  const pathSegments = getPathSegments(input.normalizedUrl);
  const path = new URL(input.normalizedUrl).pathname.toLowerCase();
  const reasons: string[] = [];
  let score = sourceWeight(input.source) + pageTypeWeight(pageType);

  if (pageType === "homepage") reasons.push("homepage_seed");
  if (["contact", "services", "product", "pricing", "about"].includes(pageType)) {
    reasons.push(`commercial_${pageType}_page`);
  }
  if (["case_study", "testimonial", "location"].includes(pageType)) {
    reasons.push(`supporting_${pageType}_page`);
  }
  if (input.source.includes("sitemap")) reasons.push("public_sitemap_candidate");
  if (input.source === "nav_link") reasons.push("homepage_navigation_link");
  if (input.source === "rendered_link") reasons.push("rendered_homepage_link");
  if (input.source === "static_link") reasons.push("static_homepage_link");

  if (input.sitemapPriority !== undefined) {
    score += Math.round(input.sitemapPriority * 20);
    reasons.push("sitemap_priority");
  }
  if (input.sitemapLastmod) {
    score += 5;
    reasons.push("sitemap_lastmod_present");
  }

  score -= pathSegments.length * 8;
  if (LOW_PRIORITY_PATTERN.test(path)) {
    score -= 55;
    reasons.push("lower_priority_content_or_policy_path");
  }
  if (EXCLUDED_PATH_PATTERN.test(path)) {
    score -= 500;
    reasons.push("excluded_transactional_or_private_path");
  }

  return {
    url: input.url,
    normalizedUrl: input.normalizedUrl,
    source: input.source,
    pageType,
    score,
    reasons: reasons.length > 0 ? reasons : ["internal_page_candidate"],
  };
}

function compareCandidates(left: PageCandidate, right: PageCandidate) {
  const homepageDelta =
    (right.pageType === "homepage" ? 1 : 0) - (left.pageType === "homepage" ? 1 : 0);
  if (homepageDelta !== 0) return homepageDelta;

  const scoreDelta = right.score - left.score;
  if (scoreDelta !== 0) return scoreDelta;

  const leftDepth = getPathSegments(left.normalizedUrl).length;
  const rightDepth = getPathSegments(right.normalizedUrl).length;
  if (leftDepth !== rightDepth) return leftDepth - rightDepth;

  return left.normalizedUrl.localeCompare(right.normalizedUrl);
}

export function selectPageCandidates(
  candidates: PageCandidate[],
  limits?: Partial<CrawlerLimits>
): PageCandidate[] {
  const effectiveLimits = { ...DEFAULT_CRAWLER_LIMITS, ...limits };
  const seen = new Set<string>();
  const familyCounts = new Map<string, number>();
  const unique = candidates
    .filter((candidate) => {
      if (seen.has(candidate.normalizedUrl)) return false;
      seen.add(candidate.normalizedUrl);
      return true;
    })
    .filter((candidate) => !EXCLUDED_PATH_PATTERN.test(new URL(candidate.normalizedUrl).pathname))
    .filter((candidate) => candidate.pageType !== "legal")
    .slice(0, effectiveLimits.maxPagesDiscovered)
    .sort(compareCandidates);

  const homepage = unique.find((candidate) => candidate.pageType === "homepage");
  const selected: PageCandidate[] = [];

  if (homepage) {
    selected.push(homepage);
    familyCounts.set(getPathFamily(homepage.normalizedUrl), 1);
  }

  for (const candidate of unique) {
    if (selected.length >= effectiveLimits.maxPagesCaptured) break;
    if (candidate.pageType === "homepage") continue;

    const depth = getPathSegments(candidate.normalizedUrl).length;
    if (depth > effectiveLimits.maxDepth) continue;

    const family = getPathFamily(candidate.normalizedUrl);
    const familyCount = familyCounts.get(family) ?? 0;
    if (familyCount >= effectiveLimits.maxSamePathFamily) continue;

    selected.push(candidate);
    familyCounts.set(family, familyCount + 1);
  }

  return selected;
}

export function describeCandidateForSnapshot(candidate: PageCandidate) {
  return {
    url: candidate.normalizedUrl,
    pageType: toSnapshotPageType(candidate.pageType),
    pagePriority: Math.max(0, 1_000 - candidate.score),
  };
}
