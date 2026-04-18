import type { PageType } from "./types.js";

export interface DiscoveredPage {
  url: string;
  type: PageType;
}

export function classifyPageTarget(url: string, linkText: string): PageType {
  const normalizedText = linkText.toLowerCase().trim();
  const normalizedPath = new URL(url).pathname.toLowerCase();

  if (normalizedPath === "/" || normalizedPath === "/home") {
    return "homepage";
  }

  if (
    normalizedText.includes("about") ||
    normalizedPath.includes("/about") ||
    normalizedPath.includes("/company") ||
    normalizedPath.includes("/our-story")
  ) {
    return "about";
  }

  if (
    normalizedText.includes("service") ||
    normalizedText.includes("product") ||
    normalizedText.includes("solution") ||
    normalizedPath.includes("/services") ||
    normalizedPath.includes("/products") ||
    normalizedPath.includes("/solutions")
  ) {
    return "services";
  }

  if (
    normalizedText.includes("contact") ||
    normalizedText.includes("book") ||
    normalizedPath.includes("/contact") ||
    normalizedPath.includes("/book")
  ) {
    return "contact";
  }

  if (
    normalizedText.includes("blog") ||
    normalizedPath.includes("/blog") ||
    normalizedPath.includes("/article") ||
    normalizedPath.includes("/resources")
  ) {
    return "content";
  }

  return "other";
}



export async function discoverPriorityPages(
  page: import("playwright").Page,
  domain: string
): Promise<DiscoveredPage[]> {
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  // Extract all a hrefs with their text
  const links = await page.evaluate((baseDomainUrl) => {
    const anchors = Array.from(document.querySelectorAll("a"));
    return anchors
      .map((a) => {
        try {
          const url = new URL(a.href, baseDomainUrl);
          return {
            href: url.href,
            origin: url.origin,
            pathname: url.pathname,
            text: a.innerText.trim(),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ href: string; origin: string; pathname: string; text: string }>;
  }, baseUrl);

  const baseOrigin = new URL(baseUrl).origin;
  const discovered: DiscoveredPage[] = [];
  const seenUrls = new Set<string>();
  
  // Always include homepage explicitly if it isn't gathered implicitly
  seenUrls.add(baseUrl);
  
  // Only internal links, ignore hashes, mailto, etc.
  const internalLinks = links.filter((l) => {
    if (l.origin !== baseOrigin) return false;
    if (l.href.includes("#")) return false; // ignore fragment links on same page
    if (seenUrls.has(l.href)) return false;
    
    // Ignore obvious assets
    if (l.pathname.match(/\.(png|jpg|jpeg|gif|pdf|doc|css|js|mp4)$/i)) return false;

    seenUrls.add(l.href);
    return true;
  });

  const categoriesSelected = new Set<PageType>();

  for (const link of internalLinks) {
    if (discovered.length >= 4) break; // We want 5 total (homepage + 4)

    const type = classifyPageTarget(link.href, link.text);
    
    // Pick at most one of each category (excluding 'other')
    if (type !== "other" && type !== "homepage" && !categoriesSelected.has(type)) {
      discovered.push({ url: link.href, type });
      categoriesSelected.add(type);
    }
  }

  // If we didn't fill up with priority categories, try adding a content or other page
  if (discovered.length < 4) {
    for (const link of internalLinks) {
      if (discovered.length >= 4) break;
      const type = classifyPageTarget(link.href, link.text);
      if (type === "other" && !discovered.find(d => d.url === link.href)) {
        discovered.push({ url: link.href, type });
      }
    }
  }

  return discovered;
}
