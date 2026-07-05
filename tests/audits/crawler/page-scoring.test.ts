import { describe, expect, it } from "vitest";
import {
  scorePageCandidate,
  selectPageCandidates,
} from "@/server/audits/crawler/page-scoring";
import type { CrawlSource, PageCandidate } from "@/server/audits/crawler/types";

function candidate(path: string, source: CrawlSource = "static_link"): PageCandidate {
  const url = `https://example.com${path}`;
  return scorePageCandidate({
    url,
    normalizedUrl: url,
    source,
  });
}

describe("business-priority page scoring", () => {
  it("always includes homepage", () => {
    const selected = selectPageCandidates([
      candidate("/blog/post"),
      candidate("/", "homepage_seed"),
      candidate("/privacy"),
    ]);

    expect(selected[0]?.pageType).toBe("homepage");
  });

  it("scores services, contact, pricing, and product pages high", () => {
    const highPriority = ["/services", "/contact", "/pricing", "/product"].map((path) =>
      candidate(path)
    );

    expect(highPriority.every((item) => item.score > candidate("/blog").score)).toBe(true);
    expect(highPriority.every((item) => item.reasons.length > 0)).toBe(true);
  });

  it("excludes privacy, terms, login, cart, checkout, account, and search URLs", () => {
    const selected = selectPageCandidates([
      candidate("/", "homepage_seed"),
      candidate("/privacy"),
      candidate("/terms"),
      candidate("/login"),
      candidate("/cart"),
      candidate("/checkout"),
      candidate("/account"),
      candidate("/search?q=x"),
      candidate("/contact"),
    ]);

    expect(selected.map((item) => new URL(item.normalizedUrl).pathname)).toEqual(["/", "/contact"]);
  });

  it("prioritizes blog lower than business pages", () => {
    expect(candidate("/blog/how-to").score).toBeLessThan(candidate("/services").score);
  });

  it("enforces max same path family", () => {
    const selected = selectPageCandidates(
      [
        candidate("/", "homepage_seed"),
        candidate("/services/a"),
        candidate("/services/b"),
        candidate("/services/c"),
      ],
      { maxSamePathFamily: 2, maxPagesCaptured: 5, maxDepth: 2 }
    );

    expect(selected.filter((item) => item.normalizedUrl.includes("/services/"))).toHaveLength(2);
  });

  it("enforces max captured pages", () => {
    const selected = selectPageCandidates(
      [
        candidate("/", "homepage_seed"),
        candidate("/services"),
        candidate("/contact"),
        candidate("/pricing"),
      ],
      { maxPagesCaptured: 2 }
    );

    expect(selected).toHaveLength(2);
  });
});
