import { randomUUID } from "crypto";
import { withDbClient } from "@/db/client";
import type { CaptureFidelity } from "@/lib/types";
import {
  normalizeProspectIntelligenceResult,
  type ProspectAuditAgentMetadata,
  type ProspectAuditAgentResult,
} from "@/server/agents/prospect-audit-agent";

interface ProspectIntelligenceRow {
  id: string;
  audit_run_id: string;
  prospect_fit_score: number;
  commercial_opportunity_score: number;
  capture_fidelity: CaptureFidelity;
  confidence: "high" | "medium" | "low";
  primary_gap: string;
  recommended_service: string;
  outreach_angle: string;
  result_json: unknown;
  model: string;
  prompt_version: string;
  schema_version: string;
  input_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProspectIntelligenceRecord {
  id: string;
  auditRunId: string;
  prospectFitScore: number;
  commercialOpportunityScore: number;
  captureFidelity: CaptureFidelity;
  confidence: "high" | "medium" | "low";
  primaryGap: string;
  recommendedService: string;
  outreachAngle: string;
  result: ProspectAuditAgentResult | null;
  schemaVersion: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: ProspectIntelligenceRow): ProspectIntelligenceRecord {
  return {
    id: row.id,
    auditRunId: row.audit_run_id,
    prospectFitScore: row.prospect_fit_score,
    commercialOpportunityScore: row.commercial_opportunity_score,
    captureFidelity: row.capture_fidelity,
    confidence: row.confidence,
    primaryGap: row.primary_gap,
    recommendedService: row.recommended_service,
    outreachAngle: row.outreach_angle,
    result: normalizeProspectIntelligenceResult(row.result_json),
    schemaVersion: row.schema_version,
    model: row.model,
    promptVersion: row.prompt_version,
    inputHash: row.input_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const prospectIntelligenceRepository = {
  async save(input: {
    auditRunId: string;
    captureFidelity: CaptureFidelity;
    result: ProspectAuditAgentResult;
    metadata: ProspectAuditAgentMetadata;
  }): Promise<ProspectIntelligenceRecord> {
    return withDbClient(async (client) => {
      const result = await client.query<ProspectIntelligenceRow>(
        `
          INSERT INTO prospect_intelligence (
            id,
            audit_run_id,
            prospect_fit_score,
            commercial_opportunity_score,
            capture_fidelity,
            confidence,
            primary_gap,
            recommended_service,
            outreach_angle,
            result_json,
            model,
            prompt_version,
            schema_version,
            input_hash
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
          ON CONFLICT (audit_run_id) DO UPDATE SET
            prospect_fit_score = EXCLUDED.prospect_fit_score,
            commercial_opportunity_score = EXCLUDED.commercial_opportunity_score,
            capture_fidelity = EXCLUDED.capture_fidelity,
            confidence = EXCLUDED.confidence,
            primary_gap = EXCLUDED.primary_gap,
            recommended_service = EXCLUDED.recommended_service,
            outreach_angle = EXCLUDED.outreach_angle,
            result_json = EXCLUDED.result_json,
            model = EXCLUDED.model,
            prompt_version = EXCLUDED.prompt_version,
            schema_version = EXCLUDED.schema_version,
            input_hash = EXCLUDED.input_hash,
            updated_at = NOW()
          RETURNING *
        `,
        [
          randomUUID(),
          input.auditRunId,
          input.result.prospectFitScore,
          input.result.commercialOpportunityScore,
          input.captureFidelity,
          input.result.reachOutRecommendation.confidence,
          input.result.primaryGap,
          input.result.recommendedService.name,
          input.result.outreachAngle.openingInsight,
          JSON.stringify(input.result),
          input.metadata.model,
          input.metadata.promptVersion,
          input.metadata.schemaVersion,
          input.metadata.inputHash,
        ]
      );

      return mapRow(result.rows[0]);
    });
  },

  async getForAuditRun(auditRunId: string): Promise<ProspectIntelligenceRecord | null> {
    return withDbClient(async (client) => {
      const result = await client.query<ProspectIntelligenceRow>(
        `
          SELECT *
          FROM prospect_intelligence
          WHERE audit_run_id = $1
          LIMIT 1
        `,
        [auditRunId]
      );

      return result.rows[0] ? mapRow(result.rows[0]) : null;
    });
  },
};
