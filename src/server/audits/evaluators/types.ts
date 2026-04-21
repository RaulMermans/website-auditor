import type {
  EvidenceLabel,
  FindingCategory,
  FindingConfidence,
  FindingSeverity,
  PageSnapshot,
} from "@/lib/types";

export type FindingBusinessImpact = "high" | "medium" | "low";

export interface TrustSignalMetrics {
  testimonials: boolean;
  socialProof: boolean;
  logoBlock: boolean;
  guarantee: boolean;
  contactInfo: boolean;
  privacyLink: boolean;
  certifications: boolean;
  density: number;
}

export interface CTAInventoryMetrics {
  count: number;
  texts: string[];
  hasDuplicates: boolean;
}

export interface FormFrictionMetrics {
  fieldCount: number;
  hasLabels: boolean;
  requiredCount: number;
}

export interface MessagingQualityMetrics {
  genericIntroDetected: boolean;
  heroTextLength: number;
}

export interface ParsedPageMetrics {
  title: { present: boolean; text: string | null };
  metaDescription: { present: boolean; content: string | null };
  h1Count: number;
  imageCount: number;
  missingAltCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  formPresent: boolean;
  ctaPresent: boolean;
  buttonCount: number;
  canonicalPresent: boolean;
  robotsMeta: { present: boolean; content: string | null; noindex: boolean; nofollow: boolean };
  viewportMetaPresent: boolean;
  headingStructure: {
    counts: Record<"h1" | "h2" | "h3" | "h4" | "h5" | "h6", number>;
    hints: string[];
  };
  textFlags: string[];
  trustSignals: TrustSignalMetrics;
  ctaInventory: CTAInventoryMetrics;
  formFriction: FormFrictionMetrics;
  messagingQuality: MessagingQualityMetrics;
  scriptCount: number;
}

export interface SpecialistFindingDraft {
  category: FindingCategory;
  issueType: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  evidenceLevel: EvidenceLabel;
  evidenceKeys: string[];
  recommendation: string;
  businessImpact: FindingBusinessImpact;
}

export interface EvaluatorContext {
  snapshot: Pick<PageSnapshot, "url" | "pageType">;
  metrics: ParsedPageMetrics;
}

export type SpecialistEvaluator = (context: EvaluatorContext) => SpecialistFindingDraft[];
