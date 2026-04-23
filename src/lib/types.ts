// Core domain types aligned with CLAUDE.md entity model.
// These are structural contracts — implementations live in src/db/ and src/server/.

export type EvidenceLabel = "Measured" | "Observed" | "Inferred";
export type ClaimPosture = "confirmed" | "observed_pattern" | "directional";
export type FindingSupportType = "dom" | "cross_page" | "inferred";
export type FindingEvaluatorStatus = "accepted" | "needs_review";
export type AuditFailureKind =
  | "blocked"
  | "access_denied"
  | "auth_wall"
  | "capture_blocked"
  | "runtime_error"
  | "analysis_error"
  | "unknown";
export type AuditFailureStage = "discover" | "capture" | "analyze" | "report";
export interface AuditFailureDetails {
  source?: "target" | "runtime" | "analysis" | "network" | "unknown";
  url?: string;
  statusCode?: number;
  driver?: string;
  marker?:
    | "http_401"
    | "http_403"
    | "http_429"
    | "bot_challenge"
    | "auth_wall"
    | "access_denied"
    | "dns_error"
    | "navigation_timeout"
    | "browser_launch"
    | "analysis_exception"
    | "unknown";
  retryable?: boolean;
  message?: string;
}
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

export type PageState =
  | "queued"
  | "capturing"
  | "captured"
  | "auditing"
  | "evaluating"
  | "accepted"
  | "needs_review"
  | "failed";

export type PageType =
  | "homepage"
  | "pricing"
  | "product"
  | "about"
  | "services"
  | "contact"
  | "form"
  | "content"
  | "legal"
  | "other";

export type PageReviewStatus =
  | "queued"
  | "capturing"
  | "auditing"
  | "evaluating"
  | "accepted"
  | "needs_review"
  | "failed";

export type PageEvaluatorStatus =
  | "queued"
  | "evaluating"
  | "accepted"
  | "needs_review"
  | "failed";

export type FindingReviewStatus = "accepted" | "needs_review";

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
  failureKind?: AuditFailureKind | null;
  failureStage?: AuditFailureStage | null;
  failureDetails?: AuditFailureDetails | null;
  createdAt: Date;
}

export interface PageSnapshot {
  id: string;
  auditRunId: string;
  url: string;
  pageType: PageType;
  pagePriority?: number;
  pageState?: PageState;
  retryCount?: number;
  lastError?: string | null;
  htmlStorageKey?: string;
  screenshotStorageKey?: string;
  capturedAt?: Date | null;
  reviewStatus?: PageReviewStatus;
  escalationReason?: string | null;
  evaluatorStatus?: PageEvaluatorStatus;
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
  claimPosture?: ClaimPosture;
  supportType?: FindingSupportType;
  evaluatorStatus?: FindingEvaluatorStatus;
  evaluatorNotes?: string | null;
  recommendation: string;
  reviewStatus?: FindingReviewStatus;
  reviewReason?: string | null;
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
