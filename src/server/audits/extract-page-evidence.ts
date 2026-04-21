import type {
  AuditRun,
  PageSnapshot,
} from "@/lib/types";
import type { CreateFindingInput, CreatePageEvidenceInput } from "@/db/analysis";
import { runSpecialistEvaluators } from "@/server/audits/evaluators";
import type {
  CTAInventoryMetrics,
  FormFrictionMetrics,
  MessagingQualityMetrics,
  ParsedPageMetrics,
  SpecialistFindingDraft,
  TrustSignalMetrics,
} from "@/server/audits/evaluators/types";

const GENERIC_INTRO_PATTERNS = [
  /^welcome to (our|the|my)\b/i,
  /^we (are|provide|offer|specialize)\b/i,
  /^our (company|team|agency|firm|business)\b/i,
  /^at [a-zA-Z ]{1,40},?\s+we /i,
  /^hello,?\s+(we'?re|our)\b/i,
  /^thank you for visiting\b/i,
];

const CTA_PATTERNS = [
  "contact",
  "book",
  "schedule",
  "start",
  "get started",
  "request",
  "demo",
  "quote",
  "buy",
  "sign up",
  "signup",
  "subscribe",
  "call",
  "talk",
  "learn more",
];

const PLACEHOLDER_PATTERNS = [
  { pattern: "lorem ipsum", flag: "placeholder_copy" },
  { pattern: "coming soon", flag: "coming_soon" },
  { pattern: "under construction", flag: "under_construction" },
];

export interface ExtractedPageArtifacts {
  pageEvidence: CreatePageEvidenceInput[];
  findings: CreateFindingInput[];
}

interface TagMatch {
  raw: string;
  attrs: Record<string, string>;
}

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function stripTags(value: string) {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

function parseAttributes(rawTag: string) {
  const attrs: Record<string, string> = {};
  const openTag = rawTag
    .replace(/^<\s*\/?\s*[^\s/>]+/, "")
    .replace(/\/?>$/, "");
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of openTag.matchAll(pattern)) {
    const [, rawName, doubleQuoted, singleQuoted, bare] = match;
    if (!rawName) {
      continue;
    }

    attrs[rawName.toLowerCase()] = doubleQuoted ?? singleQuoted ?? bare ?? "";
  }

  return attrs;
}

function findStartTags(html: string, tagName: string): TagMatch[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");

  return Array.from(html.matchAll(pattern)).map((match) => ({
    raw: match[0],
    attrs: parseAttributes(match[0]),
  }));
}

function findElementsWithContent(html: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)</${tagName}>`, "gi");

  return Array.from(html.matchAll(pattern)).map((match) => ({
    raw: match[0],
    attrs: parseAttributes(`<${tagName}${match[1]}>`),
    text: stripTags(match[2]),
  }));
}

function getMetaContent(html: string, name: string) {
  const metaTags = findStartTags(html, "meta");

  for (const tag of metaTags) {
    if (normalizeWhitespace(tag.attrs.name).toLowerCase() === name.toLowerCase()) {
      return normalizeWhitespace(tag.attrs.content) || null;
    }
  }

  return null;
}

function resolveLink(url: string, href: string) {
  try {
    return new URL(href, url);
  } catch {
    return null;
  }
}

function detectHeadingHints(html: string) {
  const counts = {
    h1: (html.match(/<h1\b/gi) ?? []).length,
    h2: (html.match(/<h2\b/gi) ?? []).length,
    h3: (html.match(/<h3\b/gi) ?? []).length,
    h4: (html.match(/<h4\b/gi) ?? []).length,
    h5: (html.match(/<h5\b/gi) ?? []).length,
    h6: (html.match(/<h6\b/gi) ?? []).length,
  };
  const hints: string[] = [];

  if (counts.h1 === 0) {
    hints.push("missing_h1");
  }

  if (counts.h1 > 1) {
    hints.push("multiple_h1");
  }

  const headingSequence = Array.from(html.matchAll(/<h([1-6])\b/gi)).map((match) =>
    Number.parseInt(match[1] ?? "0", 10)
  );

  for (let index = 1; index < headingSequence.length; index += 1) {
    const previous = headingSequence[index - 1];
    const current = headingSequence[index];

    if (current - previous > 1) {
      hints.push(`skipped_h${previous}_to_h${current}`);
      break;
    }
  }

  return { counts, hints };
}

function detectTextFlags(html: string) {
  const lowercase = html.toLowerCase();
  return PLACEHOLDER_PATTERNS.filter(({ pattern }) => lowercase.includes(pattern)).map(
    ({ flag }) => flag
  );
}

function detectTrustSignals(html: string): TrustSignalMetrics {
  const testimonials =
    /<blockquote\b/i.test(html) ||
    /class="[^"]*testimonial/i.test(html) ||
    /class="[^"]*review/i.test(html) ||
    /\d+\.?\d*\s*(out of 5|stars?|\/5)/i.test(html) ||
    /[★⭐]{3,}/u.test(html);

  const socialProof =
    /trusted by\b/i.test(html) ||
    /\d+\+?\s*(customers?|clients?|users?|companies|brands)\b/i.test(html) ||
    /\bused by\b/i.test(html);

  const logoBlock =
    /class="[^"]*logo[s-]/i.test(html) ||
    /class="[^"]*partner/i.test(html) ||
    /class="[^"]*client[s-]/i.test(html);

  const guarantee =
    /money.?back/i.test(html) ||
    /\bguarantee\b/i.test(html) ||
    /risk.?free\b/i.test(html) ||
    /no.?risk\b/i.test(html) ||
    /satisfaction guarantee/i.test(html);

  const contactInfo =
    /href="tel:/i.test(html) ||
    /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(html);

  const privacyLink =
    /<a[^>]*>[^<]*(privacy|terms)[^<]*<\/a>/i.test(html);

  const certifications =
    /\bcertified\b/i.test(html) ||
    /\baccredited\b/i.test(html) ||
    /\bISO\b/.test(html) ||
    /award.{0,20}winning/i.test(html);

  const signals = [testimonials, socialProof, logoBlock, guarantee, contactInfo, privacyLink, certifications];
  const density = signals.filter(Boolean).length;

  return { testimonials, socialProof, logoBlock, guarantee, contactInfo, privacyLink, certifications, density };
}

function buildCtaInventory(
  buttons: Array<{ text: string }>,
  anchors: Array<{ text: string }>,
  inputButtons: Array<{ attrs: Record<string, string> }>
): CTAInventoryMetrics {
  const ctaItems: string[] = [];

  for (const btn of buttons) {
    if (matchesCta(btn.text)) ctaItems.push(normalizeWhitespace(btn.text));
  }
  for (const anchor of anchors) {
    if (matchesCta(anchor.text)) ctaItems.push(normalizeWhitespace(anchor.text));
  }
  for (const btn of inputButtons) {
    const val = btn.attrs.value ?? "";
    if (matchesCta(val)) ctaItems.push(normalizeWhitespace(val));
  }

  const lowerCounts = new Map<string, number>();
  for (const t of ctaItems) {
    const key = t.toLowerCase();
    lowerCounts.set(key, (lowerCounts.get(key) ?? 0) + 1);
  }
  const hasDuplicates = Array.from(lowerCounts.values()).some((c) => c >= 3);
  const unique = [...new Set(ctaItems)].slice(0, 10);

  return { count: ctaItems.length, texts: unique, hasDuplicates };
}

function detectFormFriction(html: string): FormFrictionMetrics {
  const inputFields = findStartTags(html, "input").filter((tag) => {
    const type = (tag.attrs.type ?? "text").toLowerCase();
    return !["hidden", "submit", "button", "image", "reset"].includes(type);
  });
  const textareas = findStartTags(html, "textarea");
  const labelCount = (html.match(/<label\b/gi) ?? []).length;
  const allFields = [...inputFields, ...textareas];
  const requiredCount = allFields.filter(
    (f) => "required" in f.attrs
  ).length;

  return {
    fieldCount: allFields.length,
    hasLabels: labelCount > 0,
    requiredCount,
  };
}

function detectMessagingQuality(html: string): MessagingQualityMetrics {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyText = bodyMatch ? stripTags(bodyMatch[1]) : stripTags(html);
  const trimmed = bodyText.replace(/\s+/g, " ").trim();
  const hero = trimmed.slice(0, 400);

  const genericIntroDetected = GENERIC_INTRO_PATTERNS.some((pat) => pat.test(hero));

  return {
    genericIntroDetected,
    heroTextLength: trimmed.length,
  };
}

function matchesCta(text: string) {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return CTA_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function parseMetrics(snapshot: Pick<PageSnapshot, "url">, html: string): ParsedPageMetrics {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = normalizeWhitespace(titleMatch?.[1]);
  const metaDescription = getMetaContent(html, "description");
  const robotsContent = getMetaContent(html, "robots");
  const robotsLower = robotsContent?.toLowerCase() ?? "";
  const images = findStartTags(html, "img");
  const anchors = findElementsWithContent(html, "a");
  const buttons = findElementsWithContent(html, "button");
  const inputTags = findStartTags(html, "input");
  const forms = findStartTags(html, "form");
  const links = findStartTags(html, "link");
  const headingStructure = detectHeadingHints(html);
  const textFlags = detectTextFlags(html);

  let internalLinkCount = 0;
  let externalLinkCount = 0;
  for (const anchor of anchors) {
    const href = normalizeWhitespace(anchor.attrs.href);
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue;
    }

    const resolved = resolveLink(snapshot.url, href);
    if (!resolved) {
      continue;
    }

    if (!["http:", "https:"].includes(resolved.protocol)) {
      continue;
    }

    if (resolved.hostname === new URL(snapshot.url).hostname) {
      internalLinkCount += 1;
    } else {
      externalLinkCount += 1;
    }
  }

  const inputButtons = inputTags.filter((tag) =>
    ["button", "submit"].includes((tag.attrs.type ?? "").toLowerCase())
  );
  const ctaPresent =
    buttons.some((button) => matchesCta(button.text)) ||
    anchors.some((anchor) => matchesCta(anchor.text)) ||
    inputButtons.some((tag) => matchesCta(tag.attrs.value ?? ""));

  const canonicalPresent = links.some((tag) =>
    (tag.attrs.rel ?? "")
      .toLowerCase()
      .split(/\s+/)
      .includes("canonical")
  );

  const trustSignals = detectTrustSignals(html);
  const ctaInventory = buildCtaInventory(buttons, anchors, inputButtons);
  const formFriction = detectFormFriction(html);
  const messagingQuality = detectMessagingQuality(html);
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;

  return {
    title: {
      present: titleText.length > 0,
      text: titleText || null,
    },
    metaDescription: {
      present: Boolean(metaDescription),
      content: metaDescription,
    },
    h1Count: headingStructure.counts.h1,
    imageCount: images.length,
    missingAltCount: images.filter((tag) => normalizeWhitespace(tag.attrs.alt).length === 0).length,
    internalLinkCount,
    externalLinkCount,
    formPresent: forms.length > 0,
    ctaPresent,
    buttonCount: buttons.length + inputButtons.length,
    canonicalPresent,
    robotsMeta: {
      present: Boolean(robotsContent),
      content: robotsContent,
      noindex: robotsLower.includes("noindex") || robotsLower.includes("none"),
      nofollow: robotsLower.includes("nofollow") || robotsLower.includes("none"),
    },
    viewportMetaPresent: Boolean(getMetaContent(html, "viewport")),
    headingStructure,
    textFlags,
    trustSignals,
    ctaInventory,
    formFriction,
    messagingQuality,
    scriptCount,
  };
}

function buildPageEvidence(
  auditRunId: string,
  pageSnapshotId: string,
  metrics: ParsedPageMetrics
): CreatePageEvidenceInput[] {
  return [
    {
      auditRunId,
      pageSnapshotId,
      category: "technical_seo",
      key: "title",
      value: metrics.title,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "technical_seo",
      key: "meta_description",
      value: metrics.metaDescription,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "technical_seo",
      key: "h1_count",
      value: metrics.h1Count,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "accessibility",
      key: "image_count",
      value: metrics.imageCount,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "accessibility",
      key: "missing_alt_count",
      value: metrics.missingAltCount,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "technical_seo",
      key: "internal_link_count",
      value: metrics.internalLinkCount,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "technical_seo",
      key: "external_link_count",
      value: metrics.externalLinkCount,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "conversion",
      key: "form_present",
      value: metrics.formPresent,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "conversion",
      key: "cta_present",
      value: metrics.ctaPresent,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "conversion",
      key: "button_count",
      value: metrics.buttonCount,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "technical_seo",
      key: "canonical_present",
      value: metrics.canonicalPresent,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "technical_seo",
      key: "robots_meta",
      value: metrics.robotsMeta,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "mobile_experience",
      key: "viewport_meta_present",
      value: metrics.viewportMetaPresent,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "technical_seo",
      key: "heading_structure",
      value: metrics.headingStructure,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "messaging_content",
      key: "page_text_flags",
      value: metrics.textFlags,
      evidenceLevel: "Observed",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "trust_signals",
      key: "trust_signals",
      value: metrics.trustSignals,
      evidenceLevel: "Observed",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "conversion",
      key: "cta_inventory",
      value: metrics.ctaInventory,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "conversion",
      key: "form_friction",
      value: metrics.formFriction,
      evidenceLevel: "Measured",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "messaging_content",
      key: "messaging_quality",
      value: metrics.messagingQuality,
      evidenceLevel: "Observed",
    },
    {
      auditRunId,
      pageSnapshotId,
      category: "performance",
      key: "script_count",
      value: metrics.scriptCount,
      evidenceLevel: "Measured",
    },
  ];
}

function scopeText(auditRun: Pick<AuditRun, "homepageOnly">, text: string) {
  if (!auditRun.homepageOnly) {
    return text;
  }

  return `Homepage-only audit: ${text}`;
}

function buildFinding(
  auditRun: Pick<AuditRun, "id" | "homepageOnly">,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType">,
  draft: SpecialistFindingDraft
): CreateFindingInput {
  return {
    auditRunId: auditRun.id,
    pageSnapshotId: snapshot.id,
    category: draft.category,
    title: scopeText(auditRun, draft.title),
    description: scopeText(auditRun, draft.description),
    severity: draft.severity,
    confidence: draft.confidence,
    evidenceLevel: draft.evidenceLevel,
    evidenceRef: {
      pageUrl: snapshot.url,
      pageType: snapshot.pageType,
      scope: auditRun.homepageOnly ? "homepage_only" : "captured_pages",
      evidenceKeys: draft.evidenceKeys,
      issueType: draft.issueType,
      businessImpact: draft.businessImpact,
    },
    recommendation: scopeText(auditRun, draft.recommendation),
  };
}

export function extractPageArtifacts(
  auditRun: Pick<AuditRun, "id" | "homepageOnly">,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType">,
  html: string
): ExtractedPageArtifacts {
  const metrics = parseMetrics(snapshot, html);
  const pageEvidence = buildPageEvidence(auditRun.id, snapshot.id, metrics);
  const findings = runSpecialistEvaluators({ snapshot, metrics }).map((draft) =>
    buildFinding(auditRun, snapshot, draft)
  );

  return {
    pageEvidence,
    findings,
  };
}
