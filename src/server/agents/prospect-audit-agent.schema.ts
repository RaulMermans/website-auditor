import { z } from "zod";
import type { CaptureFidelity, FindingCategory } from "@/lib/types";
import type { ReportCaptureFidelity, ReportData } from "@/db/report";

export const PROSPECT_AUDIT_AGENT_PROMPT_VERSION = "prospect-audit-agent.v2";
export const PROSPECT_AUDIT_AGENT_SCHEMA_VERSION = "prospect-intelligence.v1";

export interface ProspectAuditAgentInput {
  domain: string;
  homepageOnly: boolean;
  overallScore: number;
  captureFidelity: ReportCaptureFidelity;
  lightlyInspectedCategories: FindingCategory[];
  insufficientEvidenceCategories: FindingCategory[];
  categoryReviewSummaries: string[];
  limitationNotes: string[];
  acceptedFindings: Array<{
    category: FindingCategory;
    claimPosture: string;
    severity: string;
    title: string;
    description: string;
    evidenceLevel: string;
    confidence: string;
    supportType: string;
    recommendation: string;
  }>;
}

export interface ProspectAuditAgentResult {
  prospectFitScore: number;
  commercialOpportunityScore: number;
  captureFidelityAssessment: string;
  primaryGap: string;
  topOpportunities: string[];
  recommendedService: string;
  outreachAngle: string;
  missingEvidence: string[];
  internalNotes: string;
  confidence: "high" | "medium" | "low";
}

export type ProspectAuditAgentGenerationResult =
  | { status: "disabled" }
  | { status: "success"; data: ProspectAuditAgentResult; metadata: ProspectAuditAgentMetadata }
  | { status: "error"; message: string };

export interface ProspectAuditAgentMetadata {
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
}

export const DEFAULT_CAPTURE_FIDELITY: ReportCaptureFidelity = {
  acceptedPageCount: 0,
  browserPageCount: 0,
  staticPageCount: 0,
  fallbackStaticPageCount: 0,
  secondaryStaticPageCount: 0,
  screenshotPageCount: 0,
  hasBrowserEvidence: false,
  primaryFidelity: "blocked_no_evidence",
};

export const ProspectAuditAgentResultSchema = z.object({
  prospectFitScore: z.number().int().min(0).max(100),
  commercialOpportunityScore: z.number().int().min(0).max(100),
  captureFidelityAssessment: z.string().min(1).max(1200).trim(),
  primaryGap: z.string().min(1).max(700).trim(),
  topOpportunities: z.array(z.string().min(1).max(500).trim()).max(5),
  recommendedService: z.string().min(1).max(500).trim(),
  outreachAngle: z.string().min(1).max(900).trim(),
  missingEvidence: z.array(z.string().min(1).max(400).trim()).max(8),
  internalNotes: z.string().min(1).max(1200).trim(),
  confidence: z.enum(["high", "medium", "low"]),
}).strict();

export const PROSPECT_AUDIT_AGENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    prospectFitScore: { type: "integer", minimum: 0, maximum: 100 },
    commercialOpportunityScore: { type: "integer", minimum: 0, maximum: 100 },
    captureFidelityAssessment: { type: "string" },
    primaryGap: { type: "string" },
    topOpportunities: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
    },
    recommendedService: { type: "string" },
    outreachAngle: { type: "string" },
    missingEvidence: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
    },
    internalNotes: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: [
    "prospectFitScore",
    "commercialOpportunityScore",
    "captureFidelityAssessment",
    "primaryGap",
    "topOpportunities",
    "recommendedService",
    "outreachAngle",
    "missingEvidence",
    "internalNotes",
    "confidence",
  ],
  additionalProperties: false,
};

export function normalizeCaptureFidelity(fidelity?: ReportCaptureFidelity): ReportCaptureFidelity {
  return fidelity ?? DEFAULT_CAPTURE_FIDELITY;
}

export function captureFidelityAllowsVisualClaims(fidelity: CaptureFidelity) {
  return fidelity === "rendered_browser" || fidelity === "manual_evidence";
}

export function isAcceptedReportFinding(finding: ReportData["findings"][number]) {
  return finding.evaluatorStatus !== "needs_review" && finding.reviewStatus !== "needs_review";
}
