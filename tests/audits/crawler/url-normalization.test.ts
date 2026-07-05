import { describe, expect, it } from "vitest";
import {
  dedupeNormalizedUrls,
  normalizeAuditUrl,
} from "@/server/audits/crawler/url-normalization";

describe("audit URL normalization", () => {
  const baseUrl = "https://Example.com/";

  it("removes fragments and tracking params", () => {
    const normalized = normalizeAuditUrl(
      "https://example.com/services?utm_source=x&b=2&a=1#team",
      baseUrl
    );

    expect(normalized.normalizedUrl).toBe("https://example.com/services?a=1&b=2");
  });

  it("sorts query params", () => {
    expect(normalizeAuditUrl("/pricing?z=9&a=1", baseUrl).normalizedUrl).toBe(
      "https://example.com/pricing?a=1&z=9"
    );
  });

  it("rejects external domains", () => {
    expect(normalizeAuditUrl("https://other.example.org/", baseUrl)).toMatchObject({
      rejected: true,
      rejectionReason: "external_domain",
    });
  });

  it("rejects mailto, tel, and javascript URLs", () => {
    expect(normalizeAuditUrl("mailto:hello@example.com", baseUrl).rejected).toBe(true);
    expect(normalizeAuditUrl("tel:+15555551212", baseUrl).rejected).toBe(true);
    expect(normalizeAuditUrl("javascript:void(0)", baseUrl).rejected).toBe(true);
  });

  it("rejects media and file URLs", () => {
    expect(normalizeAuditUrl("/brochure.pdf", baseUrl)).toMatchObject({
      rejected: true,
      rejectionReason: "file_or_media_url",
    });
    expect(normalizeAuditUrl("/image.webp", baseUrl).rejected).toBe(true);
  });

  it("normalizes trailing slashes for dedupe", () => {
    expect(normalizeAuditUrl("/about/", baseUrl).normalizedUrl).toBe("https://example.com/about");
  });

  it("dedupes same URL variants", () => {
    const urls = [normalizeAuditUrl("/about/", baseUrl), normalizeAuditUrl("/about", baseUrl)];
    expect(dedupeNormalizedUrls(urls).map((url) => url.normalizedUrl)).toEqual([
      "https://example.com/about",
    ]);
  });

  it("rejects private/internal IP URL literals", () => {
    expect(normalizeAuditUrl("http://127.0.0.1/admin", "http://127.0.0.1/")).toMatchObject({
      rejected: true,
      rejectionReason: "private_or_internal_ip",
    });
  });
});
