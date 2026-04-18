import { describe, expect, it } from "vitest";
import { normalizeDomain } from "@/lib/domain";

describe("normalizeDomain", () => {
  it("normalizes protocol and trailing slash", () => {
    expect(normalizeDomain("https://Example.com/")).toBe("example.com");
  });

  it("keeps a lowercase host without protocol", () => {
    expect(normalizeDomain("example.com")).toBe("example.com");
  });

  it("preserves subdomains", () => {
    expect(normalizeDomain("http://www.example.com")).toBe("www.example.com");
  });

  it("rejects paths", () => {
    expect(() => normalizeDomain("example.com/about")).toThrow(
      "Enter a domain only. Paths and query strings are not supported yet."
    );
  });

  it("rejects query strings", () => {
    expect(() => normalizeDomain("https://example.com?ref=nav")).toThrow(
      "Enter a domain only. Paths and query strings are not supported yet."
    );
  });
});
