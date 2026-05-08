import { z } from "zod";
import type { CaptureFidelity, FindingCategory } from "@/lib/types";
import type { ReportCaptureFidelity, ReportData } from "@/db/report";

export const PROSPECT_AUDIT_AGENT_PROMPT_VERSION = "prospect-audit-agent.v3";
export const PROSPECT_AUDIT_AGENT_SCHEMA_VERSION = "prospect-intelligence.v2";

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

// ─── Structured output schema (v2) ───────────────────────────────────────────

export const ProspectAuditAgentOutputSchema = z.object({
  prospectFitScore: z.number().min(0).max(100),
  commercialOpportunityScore: z.number().min(0).max(100),
  captureFidelityAssessment: z.object({
    level: z.enum([
      "rendered_browser",
      "static_public",
      "secondary_static",
      "manual_evidence",
      "blocked_no_evidence",
    ]),
    confidence: z.enum(["low", "medium", "high"]),
    summary: z.string().min(1).max(600),
    limitations: z.array(z.string().max(300)).max(6),
  }),
  reachOutRecommendation: z.object({
    decision: z.enum(["yes", "maybe", "no"]),
    rationale: z.string().min(1).max(600),
    confidence: z.enum(["low", "medium", "high"]),
  }),
  primaryGap: z.string().min(1).max(500),
  topOpportunities: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        evidence: z.string().min(1).max(600),
        evidenceLabel: z.enum(["Measured", "Observed", "Inferred"]),
        businessImpact: z.string().min(1).max(600),
        recommendedAction: z.string().min(1).max(600),
        priority: z.enum(["critical", "high", "medium", "low"]),
        confidence: z.enum(["low", "medium", "high"]),
      })
    )
    .min(1)
    .max(5),
  recommendedService: z.object({
    name: z.string().min(1).max(200),
    rationale: z.string().min(1).max(600),
    confidence: z.enum(["low", "medium", "high"]),
  }),
  outreachAngle: z.object({
    subjectLine: z.string().min(1).max(120),
    openingInsight: z.string().min(1).max(600),
    messageDraft: z.string().min(1).max(1200),
  }),
  missingEvidence: z.array(z.string().max(300)).max(8),
  internalNotes: z.object({
    whyNow: z.string().max(500),
    suggestedNextStep: z.string().max(500),
  }),
}).strict();

export type ProspectAuditAgentResult = z.infer<typeof ProspectAuditAgentOutputSchema>;

// Kept for backward-compat reading of old persisted flat JSON
export interface ProspectAuditAgentResultLegacy {
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

/**
 * Normalizes a persisted result_json to the current structured schema.
 * Handles: new structured schema, old flat schema, malformed/partial JSON.
 * Never throws — always returns a best-effort object for safe rendering.
 */
export function normalizeProspectIntelligenceResult(
  raw: unknown
): ProspectAuditAgentResult | null {
  if (!raw || typeof raw !== "object") return null;

  // Try parsing as new structured schema first
  const structured = ProspectAuditAgentOutputSchema.safeParse(raw);
  if (structured.success) return structured.data;

  // Fall back: try to normalize from legacy flat schema
  const flat = raw as Partial<ProspectAuditAgentResultLegacy>;
  if (
    typeof flat.prospectFitScore !== "number" ||
    !flat.primaryGap
  ) {
    return null;
  }

  const topOps = Array.isArray(flat.topOpportunities)
    ? flat.topOpportunities
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .slice(0, 5)
        .map((title) => ({
          title,
          evidence: "Derived from legacy audit output.",
          evidenceLabel: "Inferred" as const,
          businessImpact: "",
          recommendedAction: "",
          priority: "medium" as const,
          confidence: (flat.confidence ?? "low") as "low" | "medium" | "high",
        }))
    : [];

  const fidelityLevel = (() => {
    const s = typeof flat.captureFidelityAssessment === "string"
      ? flat.captureFidelityAssessment.toLowerCase()
      : "";
    if (s.includes("browser")) return "rendered_browser" as const;
    if (s.includes("secondary")) return "secondary_static" as const;
    if (s.includes("blocked")) return "blocked_no_evidence" as const;
    if (s.includes("static")) return "static_public" as const;
    return "static_public" as const;
  })();

  return {
    prospectFitScore: flat.prospectFitScore,
    commercialOpportunityScore: flat.commercialOpportunityScore ?? 0,
    captureFidelityAssessment: {
      level: fidelityLevel,
      confidence: flat.confidence ?? "low",
      summary: typeof flat.captureFidelityAssessment === "string"
        ? flat.captureFidelityAssessment
        : "Capture fidelity details not available in legacy record.",
      limitations: [],
    },
    reachOutRecommendation: {
      decision: "maybe",
      rationale: flat.primaryGap ?? "Legacy record; re-run enrichment for a full decision.",
      confidence: flat.confidence ?? "low",
    },
    primaryGap: flat.primaryGap ?? "",
    topOpportunities: topOps.length > 0
      ? topOps
      : [{
          title: "Re-run Prospect Intelligence for structured opportunities.",
          evidence: "Legacy record format does not include structured opportunity data.",
          evidenceLabel: "Inferred",
          businessImpact: "",
          recommendedAction: "Re-enrich this audit run.",
          priority: "low",
          confidence: "low",
        }],
    recommendedService: {
      name: typeof flat.recommendedService === "string" ? flat.recommendedService : "",
      rationale: "Derived from legacy audit output.",
      confidence: flat.confidence ?? "low",
    },
    outreachAngle: {
      subjectLine: "",
      openingInsight: typeof flat.outreachAngle === "string" ? flat.outreachAngle : "",
      messageDraft: "",
    },
    missingEvidence: Array.isArray(flat.missingEvidence)
      ? flat.missingEvidence.filter((s): s is string => typeof s === "string")
      : [],
    internalNotes: {
      whyNow: typeof flat.internalNotes === "string" ? flat.internalNotes : "",
      suggestedNextStep: "Re-run enrichment to get structured internal notes.",
    },
  };
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

// JSON Schema passed to Gemini — mirrors ProspectAuditAgentOutputSchema
export const PROSPECT_AUDIT_AGENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    prospectFitScore: { type: "number", minimum: 0, maximum: 100 },
    commercialOpportunityScore: { type: "number", minimum: 0, maximum: 100 },
    captureFidelityAssessment: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["rendered_browser", "static_public", "secondary_static", "manual_evidence", "blocked_no_evidence"],
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        summary: { type: "string" },
        limitations: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["level", "confidence", "summary", "limitations"],
      additionalProperties: false,
    },
    reachOutRecommendation: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["yes", "maybe", "no"] },
        rationale: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["decision", "rationale", "confidence"],
      additionalProperties: false,
    },
    primaryGap: { type: "string" },
    topOpportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          evidence: { type: "string" },
          evidenceLabel: { type: "string", enum: ["Measured", "Observed", "Inferred"] },
          businessImpact: { type: "string" },
          recommendedAction: { type: "string" },
          priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title", "evidence", "evidenceLabel", "businessImpact", "recommendedAction", "priority", "confidence"],
        additionalProperties: false,
      },
      minItems: 1,
      maxItems: 5,
    },
    recommendedService: {
      type: "object",
      properties: {
        name: { type: "string" },
        rationale: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["name", "rationale", "confidence"],
      additionalProperties: false,
    },
    outreachAngle: {
      type: "object",
      properties: {
        subjectLine: { type: "string" },
        openingInsight: { type: "string" },
        messageDraft: { type: "string" },
      },
      required: ["subjectLine", "openingInsight", "messageDraft"],
      additionalProperties: false,
    },
    missingEvidence: { type: "array", items: { type: "string" }, maxItems: 8 },
    internalNotes: {
      type: "object",
      properties: {
        whyNow: { type: "string" },
        suggestedNextStep: { type: "string" },
      },
      required: ["whyNow", "suggestedNextStep"],
      additionalProperties: false,
    },
  },
  required: [
    "prospectFitScore",
    "commercialOpportunityScore",
    "captureFidelityAssessment",
    "reachOutRecommendation",
    "primaryGap",
    "topOpportunities",
    "recommendedService",
    "outreachAngle",
    "missingEvidence",
    "internalNotes",
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
