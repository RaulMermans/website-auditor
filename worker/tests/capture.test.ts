import { describe, it, expect, vi, beforeEach } from "vitest";
import { processCaptureJob } from "../src/capture.js";
import { launchBrowser } from "../src/browser.js";
import { discoverPriorityPages } from "../src/discovery.js";
import { putArtifact } from "../src/storage.js";
import * as persist from "../src/persist.js";

vi.mock("../src/browser.js");
vi.mock("../src/discovery.js");
vi.mock("../src/storage.js");
vi.mock("../src/persist.js");

describe("Worker Capture", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("completes a capture job for simple homepage", async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue({ ok: () => true }),
      url: vi.fn().mockReturnValue("https://example.com/"),
      waitForTimeout: vi.fn().mockResolvedValue(true),
      content: vi.fn().mockResolvedValue("<html>Example</html>"),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
    };

    const mockSession = {
      page: mockPage,
      close: vi.fn().mockResolvedValue(true),
    };

    vi.mocked(launchBrowser).mockResolvedValue(mockSession as any);
    vi.mocked(discoverPriorityPages).mockResolvedValue([]); // only homepage
    vi.mocked(putArtifact).mockResolvedValue("fake-key");
    vi.mocked(persist.updateAuditRunStatus).mockResolvedValue(undefined);
    vi.mocked(persist.persistPageSnapshot).mockResolvedValue(undefined);

    const result = await processCaptureJob("fake-db-url", {
      auditRunId: "run-123",
      domain: "example.com",
    });

    expect(result.auditRunId).toBe("run-123");
    expect(result.pagesProcessed).toBe(1);
    expect(result.homepageOnly).toBe(true);

    expect(persist.updateAuditRunStatus).toHaveBeenCalledWith(
      "fake-db-url", "run-123", "discovering"
    );
    expect(persist.updateAuditRunStatus).toHaveBeenCalledWith(
      "fake-db-url", "run-123", "capturing"
    );
    expect(persist.updateAuditRunStatus).toHaveBeenCalledWith(
      "fake-db-url", "run-123", "complete", undefined, true
    );
  });

  it("handles discovery of multiple pages", async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue({ ok: () => true }),
      url: vi.fn().mockReturnValue("https://example.com/"),
      waitForTimeout: vi.fn().mockResolvedValue(true),
      content: vi.fn().mockResolvedValue("<html>Example</html>"),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
    };

    vi.mocked(launchBrowser).mockResolvedValue({ page: mockPage, close: vi.fn().mockReturnValue(Promise.resolve()) } as any);
    vi.mocked(discoverPriorityPages).mockResolvedValue([
      { url: "https://example.com/about", type: "about" }
    ]);
    vi.mocked(putArtifact).mockResolvedValue("fake-key");

    const result = await processCaptureJob("fake-db-url", {
      auditRunId: "run-456",
      domain: "https://example.com",
    });

    expect(result.pagesProcessed).toBe(2); // homepage + about
    expect(result.homepageOnly).toBe(false);
  });

  it("fails gracefully if homepage fails to load", async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(null), // simulate failure
    };

    vi.mocked(launchBrowser).mockResolvedValue({ page: mockPage, close: vi.fn().mockReturnValue(Promise.resolve()) } as any);

    const result = await processCaptureJob("fake-db-url", {
      auditRunId: "run-789",
      domain: "example.com",
    });

    expect(result.pagesProcessed).toBe(0);
    expect(result.errorMessage).toMatch(/Failed to load homepage/);
    expect(persist.updateAuditRunStatus).toHaveBeenCalledWith(
      "fake-db-url", "run-789", "failed", expect.any(String)
    );
  });
});
