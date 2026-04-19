// Core domain types aligned with CLAUDE.md entity model.
// These are structural contracts — implementations live in src/db/ and src/server/.

export type EvidenceLabel = "Measured" | "Observed" | "Inferred";
export type FindingCategory =
  | "performance"
  | "technical_seo"
  | "accessibility"
  | "ux_ui"
  | "messaging_content"
  | "conversion"
  | "trust_signals"
  | "mobile_experience";
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingConfidence = "high" | "medium" | "low";

export type AuditStatus =
  | "pending"
  | "discovering"
  | "capturing"
  | "analyzing"
  | "complete"
  | "failed";

export type PageType =
  | "homepage"
  | "about"
  | "services"
  | "contact"
  | "content"
  | "other";

export interface Project {
  id: string;
  name: string;
  createdAt: Date;
}

export interface TargetDomain {
  id: string;
  domain: string;
  createdAt: Date;
}

export interface AuditRun {
  id: string;
  projectId?: string | null;
  targetDomainId: string;
  status: AuditStatus;
  homepageOnly: boolean;
  startedAt: Date;
  completedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
}

export interface PageSnapshot {
  id: string;
  auditRunId: string;
  url: string;
  pageType: PageType;
  htmlStorageKey?: string;
  screenshotStorageKey?: string;
  capturedAt: Date;
}

export interface PageEvidence {
  id: string;
  auditRunId: string;
  pageSnapshotId: string;
  category: FindingCategory;
  key: string;
  value: unknown;
  evidenceLevel: EvidenceLabel;
  createdAt: Date;
}

export interface Finding {
  id: string;
  auditRunId: string;
  pageSnapshotId: string;
  category: FindingCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  evidenceLevel: EvidenceLabel;
  evidenceRef: Record<string, unknown>;
  recommendation: string;
  createdAt: Date;
}

export interface Recommendation {
  id: string;
  auditRunId: string;
  findingId: string;
  title: string;
  rationale: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

export interface Scorecard {
  id: string;
  auditRunId: string;
  rubricId: string;
  scores: Record<string, number>;
  totalScore: number;
  computedAt: Date;
}

export interface OutreachAsset {
  id: string;
  auditRunId: string;
  type: "summary" | "quick_wins" | "email" | "collaboration" | "loom_script";
  content: string;
  generatedAt: Date;
}
