import { NextResponse } from "next/server";
import { requireAuditApiKey } from "@/lib/api-auth";
import { reportRepository } from "@/db/report";
import { buildFullReportData } from "@/server/audits/build-full-report";
import { buildAiContextPack } from "@/server/audits/build-ai-context-pack";
import { buildPdfHtml } from "@/server/audits/build-pdf-html";

// Cached at module scope so Chromium extraction runs at most once per warm instance.
let chromiumExecPathPromise: Promise<string> | null = null;

async function getChromiumExecutablePath(): Promise<string> {
  if (!chromiumExecPathPromise) {
    chromiumExecPathPromise = (async () => {
      const { default: chromium } = await import("@sparticuz/chromium");
      chromium.setGraphicsMode = false;
      return chromium.executablePath();
    })();
  }
  return chromiumExecPathPromise;
}

async function renderPdf(html: string): Promise<Buffer> {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "0";

  const executablePath = await getChromiumExecutablePath();
  const { default: chromium } = await import("@sparticuz/chromium");
  const { chromium: playwrightChromium } = await import("playwright-core");

  const browser = await playwrightChromium.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1.5cm", bottom: "1.5cm", left: "1.5cm", right: "1.5cm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ auditRunId: string }> }
) {
  const authError = requireAuditApiKey(req);
  if (authError) return authError;

  const { auditRunId } = await params;

  const reportData = await reportRepository.getReportData(auditRunId);
  if (!reportData) {
    return NextResponse.json({ error: "Audit run not found" }, { status: 404 });
  }

  if (reportData.auditRun.status !== "complete") {
    return NextResponse.json(
      { error: "Audit run is not yet complete" },
      { status: 409 }
    );
  }

  let pdfBytes: Buffer;
  try {
    const fullReport = buildFullReportData(reportData);
    const aiContextPack = buildAiContextPack(
      auditRunId,
      fullReport,
      reportData.auditRun.completedAt
    );
    const html = buildPdfHtml(fullReport, aiContextPack);
    pdfBytes = await renderPdf(html);
  } catch (err) {
    console.error("[pdf-export] render failed:", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }

  const slug = reportData.domain.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `audit-${slug}-${date}.pdf`;

  return new Response(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
