import { launchBrowser } from "./browser.js";
import { discoverPriorityPages } from "./discovery.js";
import { putArtifact } from "./storage.js";
import { persistPageSnapshot, updateAuditRunStatus } from "./persist.js";
import type { WorkerCaptureRequest, WorkerCaptureResult } from "./types.js";

// Hardcode max 5 pages total for MVP
const MAX_PAGES = 5;

export async function processCaptureJob(
  databaseUrl: string,
  request: WorkerCaptureRequest
): Promise<WorkerCaptureResult> {
  const { auditRunId, domain } = request;
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  console.log(`[worker] Starting capture for ${domain} (Run: ${auditRunId})`);

  await updateAuditRunStatus(databaseUrl, auditRunId, "discovering");

  const session = await launchBrowser();
  let homepageOnly = true;
  let pagesProcessed = 0;

  try {
    console.log(`[worker] Navigating to homepage: ${baseUrl}`);
    
    // 1. Visit homepage
    const response = await session.page.goto(baseUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    if (!response || !response.ok()) {
      throw new Error(`Failed to load homepage. Status: ${response?.status()}`);
    }

    // 2. Discover priority pages
    const discovered = await discoverPriorityPages(session.page, baseUrl);
    
    // Add homepage to the capture queue
    const queue = [
      { url: session.page.url(), type: "homepage" as const },
      ...discovered,
    ].slice(0, MAX_PAGES);

    console.log(`[worker] Discovered pages to capture:`, queue);

    await updateAuditRunStatus(databaseUrl, auditRunId, "capturing");

    // 3. Capture pages
    for (const target of queue) {
      console.log(`[worker] Capturing: ${target.url} (${target.type})`);
      
      try {
        // If it's not the homepage (which we are already on), navigate
        if (target.type !== "homepage") {
          await session.page.goto(target.url, {
            waitUntil: "networkidle",
            timeout: 20000,
          });
        }

        // Wait to stabilize
        await session.page.waitForTimeout(2000);

        const html = await session.page.content();
        const screenshotBuf = await session.page.screenshot({
          fullPage: true,
          type: "jpeg",
          quality: 80,
        });

        // Store artifacts via simple provider
        const cleanUrl = new URL(session.page.url()).pathname.replace(/[^a-zA-Z0-9]/g, "_");
        const prefix = `shot_${auditRunId}_${target.type}_${cleanUrl}`;
        const htmlKey = await putArtifact(prefix, "html", html);
        const screenshotKey = await putArtifact(prefix, "jpg", screenshotBuf);

        // Record in Postgres
        await persistPageSnapshot(databaseUrl, {
          auditRunId,
          url: session.page.url(),
          pageType: target.type,
          htmlStorageKey: htmlKey,
          screenshotStorageKey: screenshotKey,
        });

        pagesProcessed++;
        
        if (target.type !== "homepage") {
          homepageOnly = false;
        }

      } catch (err) {
        console.error(`[worker] Failed to capture ${target.url}`, err);
        // If it's the homepage that failed during capture step (unlikely), whole run fails
        if (target.type === "homepage") {
          throw err;
        }
        // Otherwise, continue to next page (graceful degradation)
      }
    }

    // 4. Mark complete
    await updateAuditRunStatus(databaseUrl, auditRunId, "complete", undefined, homepageOnly);

    console.log(`[worker] Completed capture for ${domain}. Processed: ${pagesProcessed}`);

    return {
      auditRunId,
      pagesProcessed,
      homepageOnly,
    };

  } catch (error) {
    console.error(`[worker] Fatal error during capture:`, error);
    const failureReason = error instanceof Error ? error.message : "Unknown error";
    
    // Fallback: update status to failed
    await updateAuditRunStatus(databaseUrl, auditRunId, "failed", failureReason);
    
    return {
      auditRunId,
      pagesProcessed,
      homepageOnly: true,
      errorMessage: failureReason,
    };
  } finally {
    await session.close().catch(() => {});
  }
}
