import type { PageType } from "@/lib/types";

const MAX_DISCOVERED_PAGES = 5;
const ASSET_PATH_PATTERN = /\.(png|jpg|jpeg|gif|pdf|doc|css|js|mp4|svg|webp|ico)$/i;

export interface DiscoveredPageLink {
  href: string;
  origin: string;
  pathname: string;
  text: string;
}

export interface RoutedPageTarget {
  url: string;
  pageType: PageType;
  pagePriority: number;
}

export const PAGE_TYPE_PRIORITY: Record<PageType, number> = {
  homepage: 0,
  pricing: 10,
  product: 20,
  services: 30,
  about: 40,
  contact: 50,
  form: 60,
  blog_article: 70,
  content: 70,
  legal: 80,
  other: 90,
};

function normalizeUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";

  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString();
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function getPathDepth(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length;
}

function getPrioritySortValue(pageType: PageType) {
  return PAGE_TYPE_PRIORITY[pageType];
}

export function getPagePriority(pageType: PageType) {
  return PAGE_TYPE_PRIORITY[pageType];
}

export function classifyPageArchetype(url: string, linkText = ""): PageType {
  const parsed = new URL(url);
  const normalizedPath = parsed.pathname.toLowerCase();
  const normalizedText = normalizeText(linkText);
  const combined = `${normalizedText} ${normalizedPath}`;

  if (normalizedPath === "/" || normalizedPath === "/home") {
    return "homepage";
  }

  if (
    includesAny(combined, [
      "privacy",
      "terms",
      "cookie",
      "cookies",
      "legal",
      "gdpr",
      "accessibility-statement",
    ])
  ) {
    return "legal";
  }

  if (includesAny(combined, ["pricing", "plans", "plan", "prices", "price", "cost"])) {
    return "pricing";
  }

  if (
    includesAny(combined, [
      "product",
      "products",
      "platform",
      "software",
      "app",
      "feature",
      "features",
    ])
  ) {
    return "product";
  }

  if (
    includesAny(combined, [
      "service",
      "services",
      "solution",
      "solutions",
      "capability",
      "capabilities",
      "offering",
      "offerings",
    ])
  ) {
    return "services";
  }

  if (
    includesAny(combined, [
      "about",
      "company",
      "team",
      "story",
      "mission",
      "who-we-are",
    ])
  ) {
    return "about";
  }

  if (
    includesAny(combined, [
      "contact",
      "reach-us",
      "talk-to-sales",
      "speak-with-us",
      "call-us",
    ])
  ) {
    return "contact";
  }

  if (
    includesAny(combined, [
      "demo",
      "book",
      "schedule",
      "quote",
      "estimate",
      "trial",
      "signup",
      "sign-up",
      "register",
      "apply",
      "request",
      "get-started",
    ])
  ) {
    return "form";
  }

  if (
    includesAny(combined, [
      "blog",
      "blogs",
      "article",
      "articles",
      "resource",
      "resources",
      "insight",
      "insights",
      "guide",
      "guides",
      "news",
    ])
  ) {
    return "blog_article";
  }

  return "other";
}

function compareCandidates(left: RoutedPageTarget, right: RoutedPageTarget) {
  const priorityDelta = getPrioritySortValue(left.pageType) - getPrioritySortValue(right.pageType);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const leftUrl = new URL(left.url);
  const rightUrl = new URL(right.url);
  const depthDelta = getPathDepth(leftUrl.pathname) - getPathDepth(rightUrl.pathname);
  if (depthDelta !== 0) {
    return depthDelta;
  }

  const pathnameDelta = leftUrl.pathname.localeCompare(rightUrl.pathname);
  if (pathnameDelta !== 0) {
    return pathnameDelta;
  }

  return left.url.localeCompare(right.url);
}

export function buildCapturePlan(
  homepageUrl: string,
  links: DiscoveredPageLink[],
  maxPages = MAX_DISCOVERED_PAGES
): RoutedPageTarget[] {
  const normalizedHomepageUrl = normalizeUrl(homepageUrl);
  const baseOrigin = new URL(normalizedHomepageUrl).origin;
  const seenUrls = new Set<string>([normalizedHomepageUrl]);

  const candidates = links
    .filter((link) => link.origin === baseOrigin)
    .map((link) => normalizeUrl(link.href))
    .filter((url) => {
      const parsed = new URL(url);
      if (seenUrls.has(url) || ASSET_PATH_PATTERN.test(parsed.pathname)) {
        return false;
      }

      seenUrls.add(url);
      return true;
    })
    .map((url) => {
      const link = links.find((candidate) => normalizeUrl(candidate.href) === url);
      const pageType = classifyPageArchetype(url, link?.text ?? "");
      return {
        url,
        pageType,
        pagePriority: getPagePriority(pageType),
      };
    })
    .sort(compareCandidates);

  const selected: RoutedPageTarget[] = [];
  const selectedTypes = new Set<PageType>(["homepage"]);

  for (const candidate of candidates) {
    if (selected.length >= maxPages - 1) {
      break;
    }

    if (
      candidate.pageType !== "other" &&
      candidate.pageType !== "homepage" &&
      !selectedTypes.has(candidate.pageType)
    ) {
      selected.push(candidate);
      selectedTypes.add(candidate.pageType);
    }
  }

  for (const candidate of candidates) {
    if (selected.length >= maxPages - 1) {
      break;
    }

    if (selected.some((entry) => entry.url === candidate.url) || candidate.pageType === "homepage") {
      continue;
    }

    selected.push(candidate);
  }

  const plannedPages: RoutedPageTarget[] = [
    {
      url: normalizedHomepageUrl,
      pageType: "homepage",
      pagePriority: getPagePriority("homepage"),
    },
    ...selected,
  ];

  return plannedPages.slice(0, maxPages);
}
