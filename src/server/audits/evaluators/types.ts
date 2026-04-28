import type {
  EvidenceLabel,
  FindingCategory,
  FindingConfidence,
  FindingSeverity,
  PageSnapshot,
} from "@/lib/types";
import type { RoutedPageContext } from "@/server/audits/page-rubrics";

export type FindingBusinessImpact = "high" | "medium" | "low";

export interface TrustSignalMetrics {
  testimonials: boolean;
  socialProof: boolean;
  logoBlock: boolean;
  guarantee: boolean;
  contactInfo: boolean;
  emailContact: boolean;
  addressInfo: boolean;
  contactPageLink: boolean;
  privacyLink: boolean;
  termsLink: boolean;
  certifications: boolean;
  caseStudies: boolean;
  density: number;
  proofPoints: number;
  reassuranceSignals: number;
  contactOptions: number;
}

export interface CTAInventoryMetrics {
  count: number;
  texts: string[];
  hasDuplicates: boolean;
  uniqueCount: number;
}

export interface FormFrictionMetrics {
  fieldCount: number;
  hasLabels: boolean;
  requiredCount: number;
}

export interface BrandClarityMetrics {
  heroHeading: string | null;
  heroExcerpt: string;
  audienceCueCount: number;
  outcomeCueCount: number;
  specificityCueCount: number;
  differentiationCueCount: number;
  genericClaimCount: number;
  proofCueCount: number;
  hasNamedAudience: boolean;
  hasSpecificOutcome: boolean;
  hasDifferentiator: boolean;
  hasConcreteProofCue: boolean;
}

export interface MessagingQualityMetrics {
  genericIntroDetected: boolean;
  heroTextLength: number;
  heroHeading: string | null;
  heroWordCount: number;
  h2Count: number;
  duplicateHeadingCount: number;
  valueCueCount: number;
  offerCueCount: number;
  titleAlignment: number;
}

export interface PageStructureMetrics {
  sectionCount: number;
  headingCount: number;
  duplicateHeadingCount: number;
  longParagraphCount: number;
  denseIntroCtas: number;
  denseIntroButtons: number;
  denseIntroHeadings: number;
  denseIntroFieldCount: number;
  domElementCount: number;
}

export interface AssetWeightMetrics {
  stylesheetCount: number;
  inlineStyleBlockCount: number;
  thirdPartyScriptCount: number;
  eagerImageCount: number;
  imageCount: number;
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
  brandClarity: BrandClarityMetrics;
  pageStructure: PageStructureMetrics;
  assetWeight: AssetWeightMetrics;
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
  snapshot: Pick<PageSnapshot, "url" | "pageType" | "pagePriority">;
  route: RoutedPageContext;
  metrics: ParsedPageMetrics;
}

export type SpecialistEvaluator = (context: EvaluatorContext) => SpecialistFindingDraft[];
