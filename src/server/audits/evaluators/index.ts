import { evaluateAccessibility } from "./accessibility";
import { evaluateConversion } from "./conversion";
import { evaluateMessagingContent } from "./messaging-content";
import { evaluateMobileExperience } from "./mobile-experience";
import { evaluatePerformance } from "./performance";
import { evaluateTechnicalSeo } from "./technical-seo";
import { evaluateTrustSignals } from "./trust-signals";
import { evaluateUxUi } from "./ux-ui";
import type { EvaluatorContext, SpecialistFindingDraft, SpecialistEvaluator } from "./types";

const SPECIALIST_EVALUATORS: SpecialistEvaluator[] = [
  evaluateTechnicalSeo,
  evaluateAccessibility,
  evaluateMessagingContent,
  evaluateConversion,
  evaluateTrustSignals,
  evaluateUxUi,
  evaluateMobileExperience,
  evaluatePerformance,
];

export function runSpecialistEvaluators(context: EvaluatorContext): SpecialistFindingDraft[] {
  return SPECIALIST_EVALUATORS.flatMap((evaluator) => evaluator(context));
}

export {
  evaluateAccessibility,
  evaluateConversion,
  evaluateMessagingContent,
  evaluateMobileExperience,
  evaluatePerformance,
  evaluateTechnicalSeo,
  evaluateTrustSignals,
  evaluateUxUi,
};
