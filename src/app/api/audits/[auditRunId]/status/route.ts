import { NextResponse } from "next/server";
import { withDbClient } from "@/db/client";
import { isExpectedTerminalCaptureFailure } from "@/lib/report-presentation";
import type { AuditFailureDetails, AuditFailureKind, AuditStatus } from "@/lib/types";

export interface AuditStatusResponse {
  auditRunId: string;
  status: AuditStatus;
  currentStage: string;
  pages: {
    total: number;
    accepted: number;
    failed: number;
    needsReview: number;
  };
  reportReady: boolean;
  message: string;
  failureKind?: AuditFailureKind | null;
  failureReason?: string | null;
}

const TERMINAL_STATUSES = new Set<AuditStatus>([
  "complete",
  "partial_complete",
  "needs_human_review",
  "failed",
]);

const REPORT_READY_STATUSES = new Set<AuditStatus>(["complete", "partial_complete"]);

function toCurrentStage(status: AuditStatus): string {
  switch (status) {
    case "pending":
      return "Creating audit run";
    case "discovering":
      return "Discovering pages";
    case "capturing":
      return "Capturing pages";
    case "analyzing":
      return "Extracting and reviewing evidence";
    case "complete":
    case "partial_complete":
      return "Report ready";
    case "needs_human_review":
      return "Needs review";
    case "failed":
      return "Failed";
    default:
      return "Processing";
  }
}

function toMessage(
  status: AuditStatus,
  pages: AuditStatusResponse["pages"],
  failure?: {
    failureKind?: AuditFailureKind | null;
    failureReason?: string | null;
    failureDetails?: AuditFailureDetails | null;
  }
): string {
  if (status === "complete") return "Audit complete. Report is ready.";
  if (status === "partial_complete")
    return `Partial report ready — ${pages.accepted} accepted page(s).`;
  if (status === "needs_human_review")
    return "Some pages could not be verified automatically. Human review required.";
  if (status === "failed") {
    if (isExpectedTerminalCaptureFailure(failure ?? {})) {
      return "Automated capture was blocked.";
    }
    return "The audit run failed. Try submitting again.";
  }
  if (status === "analyzing") return "Scoring and reviewing evidence…";
  if (status === "capturing") return `Capturing pages… (${pages.accepted} accepted so far)`;
  return "Audit is in progress…";
}

interface AuditRunStatusRow {
  status: AuditStatus;
  failure_kind: AuditFailureKind | null;
  failure_reason: string | null;
  failure_details: AuditFailureDetails | null;
}

interface PageCountsRow {
  total: string | number;
  accepted: string | number;
  failed: string | number;
  needs_review: string | number;
}

function toInt(v: string | number | null | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ auditRunId: string }> }
) {
  const { auditRunId } = await params;

  // Basic UUID-ish validation to prevent injection.
  if (!/^[\w-]{8,64}$/.test(auditRunId)) {
    return NextResponse.json({ error: "Invalid audit run ID" }, { status: 400 });
  }

  try {
    const { run, pageCounts } = await withDbClient(async (client) => {
      const runResult = await client.query<AuditRunStatusRow>(
        `SELECT status, failure_kind, failure_reason, failure_details FROM audit_runs WHERE id = $1`,
        [auditRunId]
      );

      if (runResult.rows.length === 0) {
        return { run: null, pageCounts: null };
      }

      const pageResult = await client.query<PageCountsRow>(
        `
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE page_state = 'accepted') AS accepted,
            COUNT(*) FILTER (WHERE page_state = 'failed') AS failed,
            COUNT(*) FILTER (WHERE page_state = 'needs_review') AS needs_review
          FROM page_snapshots
          WHERE audit_run_id = $1
        `,
        [auditRunId]
      );

      return { run: runResult.rows[0] ?? null, pageCounts: pageResult.rows[0] ?? null };
    });

    if (!run) {
      return NextResponse.json({ error: "Audit run not found" }, { status: 404 });
    }

    const pages = {
      total: toInt(pageCounts?.total),
      accepted: toInt(pageCounts?.accepted),
      failed: toInt(pageCounts?.failed),
      needsReview: toInt(pageCounts?.needs_review),
    };

    const response: AuditStatusResponse = {
      auditRunId,
      status: run.status,
      currentStage: toCurrentStage(run.status),
      pages,
      reportReady: REPORT_READY_STATUSES.has(run.status),
      message: toMessage(run.status, pages, {
        failureKind: run.failure_kind,
        failureReason: run.failure_reason,
        failureDetails: run.failure_details,
      }),
      failureKind: run.failure_kind,
      failureReason: run.failure_reason,
    };

    // Tell browsers not to cache in-progress runs.
    const cacheControl = TERMINAL_STATUSES.has(run.status)
      ? "public, max-age=60"
      : "no-store";

    return NextResponse.json(response, {
      headers: { "Cache-Control": cacheControl },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
