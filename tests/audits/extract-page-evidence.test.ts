import { describe, expect, it } from "vitest";
import { extractPageArtifacts } from "@/server/audits/extract-page-evidence";

function getEvidenceValue<T>(items: { key: string; value: unknown }[], key: string) {
  return items.find((item) => item.key === key)?.value as T;
}

describe("extractPageArtifacts", () => {
  it("extracts deterministic evidence from stored HTML", () => {
    const result = extractPageArtifacts(
      {
        id: "run-1",
        homepageOnly: false,
      },
      {
        id: "snapshot-1",
        url: "https://example.com/",
        pageType: "homepage",
      },
      `
        <html>
          <head>
            <title>Example Home</title>
            <meta name="description" content="Practical audits for teams.">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="canonical" href="https://example.com/">
          </head>
          <body>
            <h1>Audit your website</h1>
            <h3>Skipped heading level</h3>
            <img src="/hero.jpg">
            <img src="/logo.jpg" alt="Example logo">
            <a href="/contact">Contact us</a>
            <a href="https://external.example.com/review">External proof</a>
            <button>Book a demo</button>
            <p>Coming soon to more industries.</p>
            <footer>Privacy hello@example.com</footer>
          </body>
        </html>
      `
    );

    expect(getEvidenceValue<{ present: boolean; text: string | null }>(result.pageEvidence, "title"))
      .toMatchObject({
        present: true,
        text: "Example Home",
      });
    expect(getEvidenceValue<number>(result.pageEvidence, "h1_count")).toBe(1);
    expect(getEvidenceValue<number>(result.pageEvidence, "image_count")).toBe(2);
    expect(getEvidenceValue<number>(result.pageEvidence, "missing_alt_count")).toBe(1);
    expect(getEvidenceValue<number>(result.pageEvidence, "internal_link_count")).toBe(1);
    expect(getEvidenceValue<number>(result.pageEvidence, "external_link_count")).toBe(1);
    expect(getEvidenceValue<boolean>(result.pageEvidence, "cta_present")).toBe(true);
    expect(getEvidenceValue<boolean>(result.pageEvidence, "canonical_present")).toBe(true);
    expect(getEvidenceValue<{ heading: string | null }>(result.pageEvidence, "opening_copy").heading)
      .toBe("Audit your website");
    expect(getEvidenceValue<{ contactCue: boolean }>(result.pageEvidence, "page_intent_signals").contactCue)
      .toBe(true);
    expect(getEvidenceValue<{ legalCue: boolean }>(result.pageEvidence, "footer_contact_legal").legalCue)
      .toBe(true);
    expect(getEvidenceValue<{ total: number }>(result.pageEvidence, "script_inventory").total)
      .toBe(0);
    expect(
      getEvidenceValue<{ hints: string[] }>(result.pageEvidence, "heading_structure").hints
    ).toContain("skipped_h1_to_h3");
    expect(getEvidenceValue<string[]>(result.pageEvidence, "page_text_flags")).toContain(
      "coming_soon"
    );
    expect(result.pageEvidence.find((item) => item.key === "page_text_flags")?.evidenceLevel).toBe(
      "Observed"
    );
  });

  it("emits brand_clarity evidence with Observed label", () => {
    const result = extractPageArtifacts(
      { id: "run-2", homepageOnly: false },
      { id: "snapshot-2", url: "https://example.com/", pageType: "homepage" },
      `
        <html>
          <head><title>World-class solutions for every business</title></head>
          <body>
            <h1>We are a leading provider of comprehensive solutions</h1>
            <p>Our cutting-edge approach exceeds expectations every time.</p>
          </body>
        </html>
      `
    );
    const brandClarityEvidence = result.pageEvidence.find((item) => item.key === "brand_clarity");
    expect(brandClarityEvidence).toBeDefined();
    expect(brandClarityEvidence?.evidenceLevel).toBe("Observed");
    expect(brandClarityEvidence?.category).toBe("messaging_content");
    const value = brandClarityEvidence?.value as Record<string, unknown>;
    expect(typeof value.audienceCueCount).toBe("number");
    expect(typeof value.genericClaimCount).toBe("number");
    expect(value.genericClaimCount).toBeGreaterThan(0);
  });

  it("emits unclear_audience finding when hero has no audience cues on homepage", () => {
    const result = extractPageArtifacts(
      { id: "run-3", homepageOnly: false },
      { id: "snapshot-3", url: "https://example.com/", pageType: "homepage" },
      `
        <html>
          <head><title>We deliver results</title></head>
          <body>
            <h1>We deliver results that matter</h1>
            <p>Our comprehensive platform helps you succeed.</p>
          </body>
        </html>
      `
    );
    const unclearAudience = result.findings.find((f) =>
      f.evidenceRef.issueType === "unclear_audience"
    );
    expect(unclearAudience).toBeDefined();
    expect(unclearAudience?.category).toBe("messaging_content");
  });
});
