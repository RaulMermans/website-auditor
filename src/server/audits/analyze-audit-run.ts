import type {
  AuditAnalysisRepository,
  CreateFindingInput,
  CreatePageEvidenceInput,
} from "@/db/analysis";
import { auditAnalysisRepository } from "@/db/analysis";
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
}

export interface AnalyzeAuditRunResult {
  auditRunId: string;
  pageEvidence: PageEvidence[];
  findings: Finding[];
}

const defaultDeps: AnalyzeAuditRunDeps = {
  analysisRepository: auditAnalysisRepository,
  storage: storageClient,
};

export async function analyzeAuditRun(
  auditRunId: string,
  deps: AnalyzeAuditRunDeps = defaultDeps
): Promise<AnalyzeAuditRunResult> {
  const { auditRun, pageSnapshots } = await deps.analysisRepository.getAuditAnalysisContext(auditRunId);
  const pageEvidence: CreatePageEvidenceInput[] = [];
  const reviewedFindings: CreateFindingInput[] = [];
  const acceptedFindings: CreateFindingInput[] = [];

  for (const snapshot of pageSnapshots) {
    if (!snapshot.htmlStorageKey) {
      await deps.analysisRepository.updatePageReviewState({
        pageSnapshotId: snapshot.id,
        reviewStatus: "failed",
        retryCount: (snapshot.retryCount ?? 0) + 1,
        escalationReason: "HTML snapshot storage key is missing.",
        evaluatorStatus: "failed",
      });
      continue;
    }

    await deps.analysisRepository.updatePageReviewState({
      pageSnapshotId: snapshot.id,
      reviewStatus: "auditing",
      retryCount: snapshot.retryCount ?? 0,
      escalationReason: null,
      evaluatorStatus: snapshot.evaluatorStatus ?? "queued",
    });

    const htmlBuffer = await deps.storage.get(snapshot.htmlStorageKey);
    if (!htmlBuffer) {
      await deps.analysisRepository.updatePageReviewState({
        pageSnapshotId: snapshot.id,
        reviewStatus: "failed",
        retryCount: (snapshot.retryCount ?? 0) + 1,
        escalationReason: `HTML snapshot artifact missing for ${snapshot.url}.`,
        evaluatorStatus: "failed",
      });
      continue;
    }

    const extracted = extractPageArtifacts(auditRun, snapshot, htmlBuffer.toString("utf8"));
    await deps.analysisRepository.updatePageReviewState({
      pageSnapshotId: snapshot.id,
      reviewStatus: "evaluating",
      retryCount: snapshot.retryCount ?? 0,
      escalationReason: null,
      evaluatorStatus: "evaluating",
    });

    const pageReview = reviewPageFindings({
      snapshot,
      pageEvidence: extracted.pageEvidence,
      findings: extracted.findings,
    });

    pageEvidence.push(...extracted.pageEvidence);
    reviewedFindings.push(...pageReview.findings);
    acceptedFindings.push(...pageReview.acceptedFindings);

    await deps.analysisRepository.updatePageReviewState({
      pageSnapshotId: snapshot.id,
      reviewStatus: pageReview.reviewStatus,
      retryCount: pageReview.retryCount,
      escalationReason: pageReview.escalationReason,
      evaluatorStatus: pageReview.evaluatorStatus,
    });
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
    findings: [...prioritizedFindings, ...reviewedFindings.filter((finding) => finding.evaluatorStatus === "needs_review")],
  });

  return {
    auditRunId,
    pageEvidence: persisted.pageEvidence,
    findings: persisted.findings,
  };
}
