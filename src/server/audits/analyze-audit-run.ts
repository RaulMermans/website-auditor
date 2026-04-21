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
import type { Finding, PageEvidence } from "@/lib/types";

export interface AnalyzeAuditRunDeps {
  analysisRepository: AuditAnalysisRepository;
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
  const findings: CreateFindingInput[] = [];

  for (const snapshot of pageSnapshots) {
    if (!snapshot.htmlStorageKey) {
      continue;
    }

    const htmlBuffer = await deps.storage.get(snapshot.htmlStorageKey);
    if (!htmlBuffer) {
      continue;
    }

    const extracted = extractPageArtifacts(auditRun, snapshot, htmlBuffer.toString("utf8"));
    pageEvidence.push(...extracted.pageEvidence);
    findings.push(...extracted.findings);
  }

  if (pageEvidence.length === 0) {
    throw new Error(`No HTML snapshot artifacts available for audit run ${auditRunId}`);
  }

  const deduplicated = deduplicateFindings(findings);

  const persisted = await deps.analysisRepository.replaceAuditAnalysis({
    auditRunId,
    pageEvidence,
    findings: deduplicated,
  });

  return {
    auditRunId,
    pageEvidence: persisted.pageEvidence,
    findings: persisted.findings,
  };
}
