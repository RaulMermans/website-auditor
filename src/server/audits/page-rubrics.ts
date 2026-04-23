import type { FindingCategory, PageSnapshot, PageType } from "@/lib/types";
import { getPagePriority } from "@/server/audits/page-archetypes";

const COMMON_CORE_RUBRIC: FindingCategory[] = [
  "technical_seo",
  "accessibility",
  "performance",
  "mobile_experience",
];

const COMMON_ALLOWED_ISSUE_PATTERNS = [
  "missing_title",
  "missing_meta_description",
  "missing_canonical",
  "robots_noindex",
  "missing_h1",
  "multiple_h1",
  "skipped_heading_levels",
  "images_missing_alt_text",
  "missing_viewport_meta",
  "placeholder_copy_visible",
  "heavy_script_loading",
  "heavy_asset_mix",
  "complex_render_path",
];

interface PageRubricDefinition {
  emphasisCategories: FindingCategory[];
  allowedIssuePatterns: string[];
  expectedIssuePatterns: string[];
}

export interface PageRubric {
  commonCoreRubric: FindingCategory[];
  emphasisCategories: FindingCategory[];
  allowedIssuePatterns: string[];
  expectedIssuePatterns: string[];
}

export interface RoutedPageContext {
  pageType: PageType;
  pagePriority: number;
  rubric: PageRubric;
}

const RUBRIC_BY_PAGE_TYPE: Record<PageType, PageRubricDefinition> = {
  homepage: {
    emphasisCategories: [
      "messaging_content",
      "conversion",
      "trust_signals",
      "ux_ui",
      "mobile_experience",
    ],
    allowedIssuePatterns: [
      "weak_value_proposition",
      "offer_sprawl",
      "headline_section_mismatch",
      "weak_next_step_conversion_path",
      "competing_cta_hierarchy",
      "repeated_cta_labels",
      "cta_overload",
      "long_form_friction",
      "form_usability_friction",
      "high_friction_only_path",
      "low_trust_signal_density",
      "thin_social_proof_layer",
      "weak_contact_clarity",
      "missing_reassurance_near_conversion",
      "dense_mobile_intro",
      "mobile_form_burden",
      "stacked_section_heaviness",
      "weak_section_hierarchy",
      "conversion_area_overload",
      "homepage_flow_coherence",
    ],
    expectedIssuePatterns: [
      "weak_value_proposition",
      "weak_next_step_conversion_path",
      "low_trust_signal_density",
    ],
  },
  pricing: {
    emphasisCategories: ["messaging_content", "conversion", "trust_signals", "mobile_experience"],
    allowedIssuePatterns: [
      "offer_sprawl",
      "weak_next_step_conversion_path",
      "competing_cta_hierarchy",
      "repeated_cta_labels",
      "cta_overload",
      "long_form_friction",
      "form_usability_friction",
      "high_friction_only_path",
      "low_trust_signal_density",
      "thin_social_proof_layer",
      "weak_contact_clarity",
      "missing_reassurance_near_conversion",
      "dense_mobile_intro",
      "mobile_form_burden",
      "stacked_section_heaviness",
    ],
    expectedIssuePatterns: ["weak_next_step_conversion_path", "thin_social_proof_layer"],
  },
  product: {
    emphasisCategories: [
      "messaging_content",
      "conversion",
      "trust_signals",
      "ux_ui",
      "mobile_experience",
    ],
    allowedIssuePatterns: [
      "offer_sprawl",
      "weak_next_step_conversion_path",
      "competing_cta_hierarchy",
      "repeated_cta_labels",
      "cta_overload",
      "long_form_friction",
      "form_usability_friction",
      "high_friction_only_path",
      "low_trust_signal_density",
      "thin_social_proof_layer",
      "weak_contact_clarity",
      "missing_reassurance_near_conversion",
      "dense_mobile_intro",
      "mobile_form_burden",
      "stacked_section_heaviness",
      "weak_section_hierarchy",
      "conversion_area_overload",
    ],
    expectedIssuePatterns: ["offer_sprawl", "weak_next_step_conversion_path"],
  },
  services: {
    emphasisCategories: [
      "messaging_content",
      "conversion",
      "trust_signals",
      "ux_ui",
      "mobile_experience",
    ],
    allowedIssuePatterns: [
      "offer_sprawl",
      "weak_next_step_conversion_path",
      "competing_cta_hierarchy",
      "repeated_cta_labels",
      "cta_overload",
      "long_form_friction",
      "form_usability_friction",
      "high_friction_only_path",
      "low_trust_signal_density",
      "thin_social_proof_layer",
      "weak_contact_clarity",
      "missing_reassurance_near_conversion",
      "dense_mobile_intro",
      "mobile_form_burden",
      "stacked_section_heaviness",
      "weak_section_hierarchy",
      "conversion_area_overload",
    ],
    expectedIssuePatterns: ["offer_sprawl", "weak_next_step_conversion_path"],
  },
  about: {
    emphasisCategories: ["messaging_content"],
    allowedIssuePatterns: ["offer_sprawl"],
    expectedIssuePatterns: [],
  },
  contact: {
    emphasisCategories: ["conversion", "trust_signals", "ux_ui", "mobile_experience"],
    allowedIssuePatterns: [
      "weak_next_step_conversion_path",
      "competing_cta_hierarchy",
      "repeated_cta_labels",
      "cta_overload",
      "long_form_friction",
      "form_usability_friction",
      "high_friction_only_path",
      "low_trust_signal_density",
      "thin_social_proof_layer",
      "weak_contact_clarity",
      "missing_reassurance_near_conversion",
      "dense_mobile_intro",
      "mobile_form_burden",
      "stacked_section_heaviness",
      "weak_section_hierarchy",
      "conversion_area_overload",
    ],
    expectedIssuePatterns: ["form_usability_friction", "missing_reassurance_near_conversion"],
  },
  form: {
    emphasisCategories: ["conversion", "trust_signals", "mobile_experience"],
    allowedIssuePatterns: [
      "weak_next_step_conversion_path",
      "long_form_friction",
      "form_usability_friction",
      "high_friction_only_path",
      "low_trust_signal_density",
      "thin_social_proof_layer",
      "weak_contact_clarity",
      "missing_reassurance_near_conversion",
      "dense_mobile_intro",
      "mobile_form_burden",
      "stacked_section_heaviness",
    ],
    expectedIssuePatterns: ["long_form_friction", "form_usability_friction"],
  },
  blog_article: {
    emphasisCategories: ["messaging_content"],
    allowedIssuePatterns: ["offer_sprawl"],
    expectedIssuePatterns: [],
  },
  content: {
    emphasisCategories: ["messaging_content"],
    allowedIssuePatterns: ["offer_sprawl"],
    expectedIssuePatterns: [],
  },
  legal: {
    emphasisCategories: [],
    allowedIssuePatterns: [],
    expectedIssuePatterns: [],
  },
  other: {
    emphasisCategories: [],
    allowedIssuePatterns: ["weak_section_hierarchy"],
    expectedIssuePatterns: [],
  },
};

function dedupe(values: string[]) {
  return [...new Set(values)];
}

function normalizePageType(pageType: PageType): PageType {
  return pageType === "content" ? "blog_article" : pageType;
}

export function getPageRubric(pageType: PageType): PageRubric {
  const normalizedPageType = normalizePageType(pageType);
  const rubric = RUBRIC_BY_PAGE_TYPE[normalizedPageType];

  return {
    commonCoreRubric: COMMON_CORE_RUBRIC,
    emphasisCategories: rubric.emphasisCategories,
    allowedIssuePatterns: dedupe([
      ...COMMON_ALLOWED_ISSUE_PATTERNS,
      ...rubric.allowedIssuePatterns,
    ]),
    expectedIssuePatterns: rubric.expectedIssuePatterns,
  };
}

export function getRoutedPageContext(
  snapshot: Pick<PageSnapshot, "pageType" | "pagePriority">
): RoutedPageContext {
  const pageType = normalizePageType(snapshot.pageType);

  return {
    pageType,
    pagePriority: snapshot.pagePriority ?? getPagePriority(pageType),
    rubric: getPageRubric(pageType),
  };
}

export function pageHasCategoryEmphasis(
  route: RoutedPageContext,
  category: FindingCategory
) {
  return route.rubric.emphasisCategories.includes(category);
}

export function pageAllowsIssuePattern(route: RoutedPageContext, issueType: string) {
  return route.rubric.allowedIssuePatterns.includes(issueType);
}

export function pageExpectsIssuePattern(route: RoutedPageContext, issueType: string) {
  return route.rubric.expectedIssuePatterns.includes(issueType);
}
