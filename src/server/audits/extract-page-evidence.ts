import type {
  AuditRun,
  EvidenceLabel,
  FindingCategory,
  FindingConfidence,
  FindingSeverity,
  PageSnapshot,
} from "@/lib/types";
import type { CreateFindingInput, CreatePageEvidenceInput } from "@/db/analysis";

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

interface ParsedPageMetrics {
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
}

interface TagMatch {
  raw: string;
  attrs: Record<string, string>;
}

interface ScopedFindingDraft {
  category: FindingCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  evidenceLevel: EvidenceLabel;
  evidenceKeys: string[];
  recommendation: string;
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
  draft: ScopedFindingDraft
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
    },
    recommendation: scopeText(auditRun, draft.recommendation),
  };
}

function buildFindingDrafts(
  snapshot: Pick<PageSnapshot, "url" | "pageType">,
  metrics: ParsedPageMetrics
): ScopedFindingDraft[] {
  const drafts: ScopedFindingDraft[] = [];

  if (!metrics.title.present) {
    drafts.push({
      category: "technical_seo",
      title: "Missing page title",
      description:
        "The captured HTML does not include a non-empty <title> tag, so the page lacks a basic search and browser label.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["title"],
      recommendation: "Add a unique, descriptive <title> tag for this captured page.",
    });
  }

  if (!metrics.metaDescription.present) {
    drafts.push({
      category: "technical_seo",
      title: "Missing meta description",
      description:
        "No meta description was detected in the captured HTML, which leaves search snippets and social previews without a curated summary.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["meta_description"],
      recommendation: "Add a concise meta description that matches the page intent and content.",
    });
  }

  if (!metrics.canonicalPresent) {
    drafts.push({
      category: "technical_seo",
      title: "Missing canonical tag",
      description:
        "The captured page does not expose a canonical link tag, so preferred indexing signals are missing from the stored snapshot.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["canonical_present"],
      recommendation: "Add a rel=canonical tag that points to the preferred public URL for this page.",
    });
  }

  if (metrics.robotsMeta.noindex) {
    drafts.push({
      category: "technical_seo",
      title: "Robots meta requests noindex",
      description:
        "The captured robots meta tag includes a noindex-style directive, which can remove this page from search results.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["robots_meta"],
      recommendation: "Confirm the robots directive is intentional before shipping it on a public page.",
    });
  }

  if (metrics.h1Count === 0) {
    drafts.push({
      category: "technical_seo",
      title: "No H1 heading detected",
      description:
        "The stored HTML does not contain an H1 heading, so the page is missing its primary visible content label.",
      severity: "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["h1_count", "heading_structure"],
      recommendation: "Add one clear H1 that matches the main topic of the captured page.",
    });
  }

  if (metrics.h1Count > 1) {
    drafts.push({
      category: "technical_seo",
      title: "Multiple H1 headings detected",
      description:
        "More than one H1 heading was found in the captured HTML, which can dilute the primary page hierarchy.",
      severity: "low",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["h1_count", "heading_structure"],
      recommendation: "Reduce the page to a single primary H1 and demote the remaining headings.",
    });
  }

  if (metrics.headingStructure.hints.some((hint) => hint.startsWith("skipped_"))) {
    drafts.push({
      category: "technical_seo",
      title: "Heading levels skip in the captured structure",
      description:
        "The stored heading outline jumps levels, which weakens the content hierarchy exposed in the captured DOM.",
      severity: "low",
      confidence: "medium",
      evidenceLevel: "Measured",
      evidenceKeys: ["heading_structure"],
      recommendation: "Tighten the heading order so sections move through levels without skipping.",
    });
  }

  if (metrics.imageCount > 0 && metrics.missingAltCount > 0) {
    drafts.push({
      category: "accessibility",
      title: "Images missing alt text",
      description:
        "The captured HTML includes image elements without usable alt attributes, which reduces screen-reader context and fallback text quality.",
      severity:
        metrics.missingAltCount >= 3 || metrics.missingAltCount === metrics.imageCount
          ? "high"
          : "medium",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["image_count", "missing_alt_count"],
      recommendation: "Add meaningful alt text for informative images and empty alt text only for decorative ones.",
    });
  }

  if (!metrics.viewportMetaPresent) {
    drafts.push({
      category: "mobile_experience",
      title: "Missing viewport meta tag",
      description:
        "The captured HTML does not include a viewport meta tag, which removes a standard mobile scaling instruction from the page.",
      severity: "high",
      confidence: "high",
      evidenceLevel: "Measured",
      evidenceKeys: ["viewport_meta_present"],
      recommendation: "Add a standard viewport meta tag so mobile browsers scale the page correctly.",
    });
  }

  if (!metrics.ctaPresent && !metrics.formPresent) {
    const shouldFlagConversion =
      snapshot.pageType === "homepage" ||
      snapshot.pageType === "services" ||
      snapshot.pageType === "contact" ||
      snapshot.pageType === "content";

    if (shouldFlagConversion) {
      drafts.push({
        category: "conversion",
        title: "Weak next-step conversion path on captured page",
        description:
          "Based on the captured DOM, the page may not present a clear next step because no standard CTA/button heuristic or form was detected.",
        severity: snapshot.pageType === "contact" ? "high" : "medium",
        confidence: "medium",
        evidenceLevel: "Inferred",
        evidenceKeys: ["cta_present", "form_present", "button_count"],
        recommendation:
          "Add one clear next-step action for this page, such as a contact CTA, booking path, or request form.",
      });
    }
  }

  if (metrics.textFlags.length > 0) {
    drafts.push({
      category: "messaging_content",
      title: "Placeholder or staging copy is visible",
      description:
        "The captured page text includes placeholder or staging language, which is directly visible in the stored browser evidence.",
      severity: metrics.textFlags.includes("under_construction") ? "high" : "medium",
      confidence: "high",
      evidenceLevel: "Observed",
      evidenceKeys: ["page_text_flags"],
      recommendation:
        "Replace placeholder or staging copy with production messaging before using this page in audits or outreach.",
    });
  }

  return drafts;
}

export function extractPageArtifacts(
  auditRun: Pick<AuditRun, "id" | "homepageOnly">,
  snapshot: Pick<PageSnapshot, "id" | "url" | "pageType">,
  html: string
): ExtractedPageArtifacts {
  const metrics = parseMetrics(snapshot, html);
  const pageEvidence = buildPageEvidence(auditRun.id, snapshot.id, metrics);
  const findings = buildFindingDrafts(snapshot, metrics).map((draft) =>
    buildFinding(auditRun, snapshot, draft)
  );

  return {
    pageEvidence,
    findings,
  };
}
