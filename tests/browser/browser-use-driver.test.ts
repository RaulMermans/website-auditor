import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserUseDriver } from "@/server/browser/browser-use-driver";

describe("BrowserUseDriver", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a remote session and proxies browser primitives over HTTP", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://example.com", ok: true, status: 200 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [{ href: "https://example.com/about" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ html: "<html></html>" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dataBase64: Buffer.from("fake-image").toString("base64"),
            contentType: "image/jpeg",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal("fetch", fetchMock);

    const driver = new BrowserUseDriver({
      baseUrl: "https://browser-use.example",
      apiToken: "secret-token",
    });

    const session = await driver.createSession({
      viewport: { width: 1280, height: 800 },
      userAgent: "WebsiteAuditorAgent/1.0",
    });
    const navigation = await session.navigate({
      url: "https://example.com",
      waitUntil: "load",
      timeoutMs: 30000,
    });
    const evaluated = await session.evaluate<{ href: string }[]>({
      expression: "() => [{ href: 'https://example.com/about' }]",
    });
    const html = await session.extractHtml();
    const screenshot = await session.screenshot({
      format: "jpeg",
      fullPage: true,
    });
    await session.close();

    expect(navigation).toEqual({
      url: "https://example.com",
      ok: true,
      status: 200,
    });
    expect(evaluated).toEqual({
      value: [{ href: "https://example.com/about" }],
    });
    expect(html).toEqual({
      value: "<html></html>",
    });
    expect(screenshot.contentType).toBe("image/jpeg");
    expect(screenshot.data.toString()).toBe("fake-image");

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("/sessions", "https://browser-use.example"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("/sessions/session-123/navigate", "https://browser-use.example"),
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      new URL("/sessions/session-123", "https://browser-use.example"),
      expect.objectContaining({
        method: "DELETE",
      })
    );
  });

  it("surfaces remote HTTP failures with status details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("boom", {
        status: 502,
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const driver = new BrowserUseDriver({
      baseUrl: "https://browser-use.example",
    });

    await expect(driver.createSession()).rejects.toThrow(
      "Browser Use driver request failed (502): boom"
    );
  });
});
