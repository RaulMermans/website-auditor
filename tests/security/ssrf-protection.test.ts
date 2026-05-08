import { describe, expect, it } from "vitest";
import { isBlockedIPv4, isBlockedIPv6, isBlockedIP, assertPublicUrl, assertSameOriginOrApproved, SSRFError } from "@/lib/ssrf";

describe("isBlockedIPv4", () => {
  it("blocks loopback addresses", () => {
    expect(isBlockedIPv4("127.0.0.1")).toBe(true);
    expect(isBlockedIPv4("127.255.255.255")).toBe(true);
  });

  it("blocks RFC-1918 private ranges", () => {
    expect(isBlockedIPv4("10.0.0.1")).toBe(true);
    expect(isBlockedIPv4("10.255.255.255")).toBe(true);
    expect(isBlockedIPv4("172.16.0.1")).toBe(true);
    expect(isBlockedIPv4("172.31.255.255")).toBe(true);
    expect(isBlockedIPv4("192.168.1.1")).toBe(true);
    expect(isBlockedIPv4("192.168.255.255")).toBe(true);
  });

  it("blocks link-local", () => {
    expect(isBlockedIPv4("169.254.0.1")).toBe(true);
    expect(isBlockedIPv4("169.254.169.254")).toBe(true); // AWS metadata
  });

  it("blocks shared address space", () => {
    expect(isBlockedIPv4("100.64.0.1")).toBe(true);
    expect(isBlockedIPv4("100.127.255.255")).toBe(true);
  });

  it("blocks 0.0.0.0/8", () => {
    expect(isBlockedIPv4("0.0.0.0")).toBe(true);
    expect(isBlockedIPv4("0.1.2.3")).toBe(true);
  });

  it("blocks multicast", () => {
    expect(isBlockedIPv4("224.0.0.1")).toBe(true);
    expect(isBlockedIPv4("239.255.255.255")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isBlockedIPv4("1.1.1.1")).toBe(false);
    expect(isBlockedIPv4("8.8.8.8")).toBe(false);
    expect(isBlockedIPv4("93.184.216.34")).toBe(false);
    expect(isBlockedIPv4("203.0.114.1")).toBe(false); // just outside doc range
  });

  it("returns false for non-IPv4 strings", () => {
    expect(isBlockedIPv4("::1")).toBe(false);
    expect(isBlockedIPv4("example.com")).toBe(false);
  });
});

describe("isBlockedIPv6", () => {
  it("blocks loopback ::1", () => {
    expect(isBlockedIPv6("::1")).toBe(true);
    expect(isBlockedIPv6("0:0:0:0:0:0:0:1")).toBe(true);
  });

  it("blocks unspecified ::", () => {
    expect(isBlockedIPv6("::")).toBe(true);
  });

  it("blocks ULA fc00::/7", () => {
    expect(isBlockedIPv6("fc00::1")).toBe(true);
    expect(isBlockedIPv6("fd00::1")).toBe(true);
    expect(isBlockedIPv6("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(true);
  });

  it("blocks link-local fe80::/10", () => {
    expect(isBlockedIPv6("fe80::1")).toBe(true);
    expect(isBlockedIPv6("fe80:0:0:0:0:0:0:1")).toBe(true);
  });

  it("blocks IPv4-mapped private addresses", () => {
    expect(isBlockedIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIPv6("::ffff:192.168.1.1")).toBe(true);
    expect(isBlockedIPv6("::ffff:10.0.0.1")).toBe(true);
  });

  it("allows public IPv6", () => {
    expect(isBlockedIPv6("2001:db8::1")).toBe(false);
    expect(isBlockedIPv6("2606:4700:4700::1111")).toBe(false);
  });

  it("returns false for IPv4 strings", () => {
    expect(isBlockedIPv6("127.0.0.1")).toBe(false);
  });
});

describe("isBlockedIP", () => {
  it("delegates correctly for both IP families", () => {
    expect(isBlockedIP("127.0.0.1")).toBe(true);
    expect(isBlockedIP("::1")).toBe(true);
    expect(isBlockedIP("1.1.1.1")).toBe(false);
  });
});

describe("assertSameOriginOrApproved", () => {
  it("allows navigation within the same origin", () => {
    expect(() =>
      assertSameOriginOrApproved("https://example.com/", "https://example.com/about")
    ).not.toThrow();
  });

  it("allows navigation that normalizes trailing slash on the same origin", () => {
    expect(() =>
      assertSameOriginOrApproved("https://example.com", "https://example.com/")
    ).not.toThrow();
  });

  it("throws SSRFError when browser redirects to a different public origin", () => {
    expect(() =>
      assertSameOriginOrApproved("https://example.com/", "https://other.com/")
    ).toThrowError(SSRFError);
  });

  it("throws SSRFError when browser redirects from https to http on different origin", () => {
    expect(() =>
      assertSameOriginOrApproved("https://example.com/", "http://example.com/")
    ).toThrowError(SSRFError);
  });

  it("throws SSRFError when browser redirects to internal IP", () => {
    expect(() =>
      assertSameOriginOrApproved("https://example.com/", "http://192.168.1.1/")
    ).toThrowError(SSRFError);
  });

  it("throws SSRFError when browser redirects to localhost", () => {
    expect(() =>
      assertSameOriginOrApproved("https://example.com/", "http://localhost/admin")
    ).toThrowError(SSRFError);
  });

  it("error message names both origins", () => {
    let msg = "";
    try {
      assertSameOriginOrApproved("https://example.com/", "https://attacker.internal/");
    } catch (e) {
      if (e instanceof SSRFError) msg = e.message;
    }
    expect(msg).toContain("https://example.com");
    expect(msg).toContain("https://attacker.internal");
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SSRFError);
    await expect(assertPublicUrl("ftp://example.com")).rejects.toBeInstanceOf(SSRFError);
  });

  it("rejects bare private IP literals in http URLs", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(SSRFError);
    await expect(assertPublicUrl("https://10.0.0.1/path")).rejects.toBeInstanceOf(SSRFError);
    await expect(assertPublicUrl("http://192.168.1.1/")).rejects.toBeInstanceOf(SSRFError);
  });

  it("accepts public IP literals without DNS", async () => {
    await expect(assertPublicUrl("https://1.1.1.1/")).resolves.toBeUndefined();
  });

  it("resolves and accepts a real public domain", async () => {
    await expect(assertPublicUrl("https://example.com/")).resolves.toBeUndefined();
  }, 10000);

  it("throws SSRFError for invalid URLs", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toBeInstanceOf(SSRFError);
  });
});
