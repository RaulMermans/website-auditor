import type {
  AuditAnalysisContext,
  AuditAnalysisRepository,
  CreateFindingInput,
  CreatePageEvidenceInput,
} from "@/db/analysis";
import { auditAnalysisRepository } from "@/db/analysis";
import { auditJobRepository, type AuditJobRepository } from "@/db/audits";
import type { StorageClient } from "@/server/contracts/storage";
import { storageClient } from "@/server/contracts/storage";
import { extractPageArtifacts } from "@/server/audits/extract-page-evidence";
import { deduplicateFindings } from "@/server/audits/deduplicate-findings";
import { prioritizeFindings } from "@/server/audits/prioritize-findings";
import { reviewPageFindings } from "@/server/audits/review-page-findings";
import type { Finding, PageEvidence } from "@/lib/types";

export interface AnalyzeAuditRunDeps {
  analysisRepository: Pick<
    AuditAnalysisRepository,
    "getAuditAnalysisContext" | "replaceAuditAnalysis" | "updatePageReviewState"
  >;
  storage: Pick<StorageClient, "get">;
  pageSnapshots: Pick<AuditJobRepository, "updatePageSnapshotState">;
}

export interface AnalyzeAuditRunResult {
  auditRunId: string;
  pageEvidence: PageEvidence[];
  findings: Finding[];
}

const defaultDeps: AnalyzeAuditRunDeps = {
  analysisRepository: auditAnalysisRepository,
  storage: storageClient,
  pageSnapshots: auditJobRepository,
};

interface AnalyzedPageSnapshotResult {
  pageEvidence: CreatePageEvidenceInput[];
  reviewedFindings: CreateFindingInput[];
  acceptedFindings: CreateFindingInput[];
}

async function analyzePageSnapshot(
  auditRun: Pick<AuditAnalysisContext["auditRun"], "id" | "homepageOnly">,
  snapshot: AuditAnalysisContext["pageSnapshots"][number],
  deps: AnalyzeAuditRunDeps
) : Promise<AnalyzedPageSnapshotResult> {
  const pageEvidence: CreatePageEvidenceInput[] = [];
  const reviewedFindings: CreateFindingInput[] = [];
  const acceptedFindings: CreateFindingInput[] = [];
  const startingRetryCount = snapshot.retryCount ?? 0;

  for (let attempt = startingRetryCount; attempt <= 1; attempt += 1) {
    await deps.pageSnapshots.updatePageSnapshotState({
      pageSnapshotId: snapshot.id,
      pageState: "auditing",
      retryCount: attempt,
      lastError: null,
    });
    await deps.analysisRepository.updatePageReviewState({
      pageSnapshotId: snapshot.id,
      reviewStatus: "auditing",
      retryCount: attempt,
      escalationReason: null,
      evaluatorStatus: "queued",
    });

    try {
      if (!snapshot.htmlStorageKey) {
        throw new Error(`Missing HTML snapshot for ${snapshot.url}`);
      }

      const htmlBuffer = await deps.storage.get(snapshot.htmlStorageKey);
      if (!htmlBuffer) {
        throw new Error(`Stored HTML snapshot not found for ${snapshot.url}`);
      }

      const extracted = extractPageArtifacts(
        auditRun,
        snapshot,
        htmlBuffer.toString("utf8")
      );

      await deps.pageSnapshots.updatePageSnapshotState({
        pageSnapshotId: snapshot.id,
        pageState: "evaluating",
        retryCount: attempt,
        lastError: null,
      });
      await deps.analysisRepository.updatePageReviewState({
        pageSnapshotId: snapshot.id,
        reviewStatus: "evaluating",
        retryCount: attempt,
        escalationReason: null,
        evaluatorStatus: "evaluating",
      });

      const reviewed = reviewPageFindings({
        snapshot,
        pageEvidence: extracted.pageEvidence,
        findings: extracted.findings,
      });
      pageEvidence.push(...extracted.pageEvidence);
      reviewedFindings.push(...reviewed.findings);
      acceptedFindings.push(...reviewed.acceptedFindings);

      await deps.pageSnapshots.updatePageSnapshotState({
        pageSnapshotId: snapshot.id,
        pageState: reviewed.pageState,
        retryCount: reviewed.retryCount,
        lastError: reviewed.escalationReason,
      });
      await deps.analysisRepository.updatePageReviewState({
        pageSnapshotId: snapshot.id,
        reviewStatus: reviewed.reviewStatus,
        retryCount: reviewed.retryCount,
        escalationReason: reviewed.escalationReason,
        evaluatorStatus: reviewed.evaluatorStatus,
      });

      return { pageEvidence, reviewedFindings, acceptedFindings };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);

      if (attempt === 0) {
        await deps.pageSnapshots.updatePageSnapshotState({
          pageSnapshotId: snapshot.id,
          pageState: "captured",
          retryCount: 1,
          lastError: failureReason,
        });
        await deps.analysisRepository.updatePageReviewState({
          pageSnapshotId: snapshot.id,
          reviewStatus: "queued",
          retryCount: 1,
          escalationReason: failureReason,
          evaluatorStatus: "queued",
        });
        continue;
      }

      await deps.pageSnapshots.updatePageSnapshotState({
        pageSnapshotId: snapshot.id,
        pageState: "needs_review",
        retryCount: 1,
        lastError: failureReason,
      });
      await deps.analysisRepository.updatePageReviewState({
        pageSnapshotId: snapshot.id,
        reviewStatus: "needs_review",
        retryCount: 1,
        escalationReason: failureReason,
        evaluatorStatus: "needs_review",
      });

      return { pageEvidence, reviewedFindings, acceptedFindings };
    }
  }

  return { pageEvidence, reviewedFindings, acceptedFindings };
}

export async function analyzeAuditRun(
  auditRunId: string,
  deps: AnalyzeAuditRunDeps = defaultDeps
): Promise<AnalyzeAuditRunResult> {
  const { auditRun, pageSnapshots } = await deps.analysisRepository.getAuditAnalysisContext(auditRunId);
  const pageEvidence: CreatePageEvidenceInput[] = [];
  const reviewedFindings: CreateFindingInput[] = [];
  const acceptedFindings: CreateFindingInput[] = [];

  for (const snapshot of pageSnapshots) {
    if (!snapshot.htmlStorageKey || snapshot.pageState === "failed") {
      continue;
    }

    const analyzed = await analyzePageSnapshot(auditRun, snapshot, deps);
    pageEvidence.push(...analyzed.pageEvidence);
    reviewedFindings.push(...analyzed.reviewedFindings);
    acceptedFindings.push(...analyzed.acceptedFindings);
  }

  if (pageEvidence.length === 0) {
    throw new Error(`No HTML snapshot artifacts available for audit run ${auditRunId}`);
  }

  const finalizedAcceptedFindings = deduplicateFindings(acceptedFindings).map((finding) => ({
    ...finding,
    supportType:
      finding.evidenceLevel === "Inferred"
        ? "inferred"
        : typeof finding.evidenceRef.pageCount === "number" && finding.evidenceRef.pageCount > 1
          ? "cross_page"
          : finding.supportType ?? "dom",
    evaluatorStatus: "accepted" as const,
  }));
  const prioritizedFindings = prioritizeFindings(finalizedAcceptedFindings);

  const persisted = await deps.analysisRepository.replaceAuditAnalysis({
    auditRunId,
    pageEvidence,
    findings: [
      ...prioritizedFindings,
      ...reviewedFindings.filter((finding) => finding.evaluatorStatus === "needs_review"),
    ],
  });

  return {
    auditRunId,
    pageEvidence: persisted.pageEvidence,
    findings: persisted.findings,
  };
}
