import { describe, expect, it, vi } from "vitest";

const { delMock, getMock, putMock } = vi.hoisted(() => ({
  delMock: vi.fn(),
  getMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: delMock,
  get: getMock,
  put: putMock,
}));

import { buildVercelBlobProvider } from "@/server/contracts/storage";

describe("Vercel Blob storage provider", () => {
  it("writes audit artifacts with private access", async () => {
    putMock.mockResolvedValue({
      url: "https://store.private.blob.vercel-storage.com/audit-runs/run-1/homepage/root.html",
    });
    const storage = buildVercelBlobProvider("token");

    await expect(
      storage.put("audit-runs/run-1/homepage/root.html", "<html></html>", "text/html")
    ).resolves.toContain("private.blob.vercel-storage.com");

    expect(putMock).toHaveBeenCalledWith(
      "audit-runs/run-1/homepage/root.html",
      "<html></html>",
      expect.objectContaining({
        access: "private",
        addRandomSuffix: false,
        contentType: "text/html",
        token: "token",
      })
    );
    expect(putMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ access: "public" })
    );
  });

  it("reads private artifacts through the Blob SDK instead of raw public fetch", async () => {
    const body = new TextEncoder().encode("<html>private artifact</html>");
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body);
          controller.close();
        },
      }),
    });
    const storage = buildVercelBlobProvider("token");

    await expect(storage.get("audit-runs/run-1/homepage/root.html")).resolves.toEqual(
      Buffer.from(body)
    );

    expect(getMock).toHaveBeenCalledWith(
      "audit-runs/run-1/homepage/root.html",
      expect.objectContaining({
        access: "private",
        token: "token",
        useCache: false,
      })
    );
  });
});
