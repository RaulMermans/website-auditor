// Core domain types aligned with CLAUDE.md entity model.
// These are structural contracts — implementations live in src/db/ and src/server/.

export type EvidenceLabel = "Measured" | "Observed" | "Inferred";

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
  snapshotId: string;
  category: string;
  key: string;
  value: unknown;
  label: EvidenceLabel;
}

export interface Finding {
  id: string;
  auditRunId: string;
  category: string;
  title: string;
  description: string;
  label: EvidenceLabel;
  severity: "critical" | "high" | "medium" | "low" | "info";
  evidenceIds: string[];
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
  type: "email" | "summary" | "proposal";
  content: string;
  generatedAt: Date;
}
