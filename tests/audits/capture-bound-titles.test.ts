import { describe, expect, it } from "vitest";
import { extractPageArtifacts } from "@/server/audits/extract-page-evidence";
import type { CaptureMethodProvenance } from "@/lib/types";

const MINIMAL_HTML = `
<!DOCTYPE html>
<html>
<head></head>
<body><p>Hello</p></body>
</html>
`.trim();

const MINIMAL_AUDIT_RUN = {
  id: "run-bound",
  homepageOnly: false,
};

function makeSnap(
  captureMethod: CaptureMethodProvenance | null | undefined = null
): Parameters<typeof extractPageArtifacts>[1] {
  return {
    id: "snap-1",
    url: "https://example.com/",
    pageType: "homepage",
    pagePriority: 0,
    captureMethod,
  } as any;
}

function findFinding(findings: ReturnType<typeof extractPageArtifacts>["findings"], issueType: string) {
  return findings.find(
    (f) =>
      typeof f.evidenceRef.issueType === "string" &&
      f.evidenceRef.issueType === issueType
  );
}

describe("capture-bound finding titles", () => {
  describe("rendered_browser captures", () => {
    it("uses direct 'Missing page title' label for browser captures", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap("browser"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_title");
      expect(f).toBeDefined();
      expect(f?.title).toBe("Missing page title");
    });

    it("uses direct 'No H1 heading detected' for browser captures", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap("browser"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_h1");
      expect(f?.title).toBe("No H1 heading detected");
    });
  });

  describe("static_public captures", () => {
    it("uses bounded title 'Title tag not detected in captured static HTML'", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap("static"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_title");
      expect(f).toBeDefined();
      expect(f?.title).toBe("Title tag not detected in captured static HTML");
    });

    it("uses bounded title for missing meta description", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap("static"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_meta_description");
      expect(f?.title).toBe("Meta description not detected in captured static HTML");
    });

    it("uses bounded title for missing canonical", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap("static"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_canonical");
      expect(f?.title).toBe("Canonical tag not exposed in captured static HTML");
    });

    it("uses bounded title for missing H1", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap("static"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_h1");
      expect(f?.title).toBe("H1 heading not detected in captured static HTML");
    });
  });

  describe("fallback_static captures", () => {
    it("uses bounded title for missing page title", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap("fallback_static"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_title");
      expect(f?.title).toBe("Title tag not detected in captured static HTML");
    });
  });

  describe("secondary_static captures", () => {
    it("uses bounded title for missing page title", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap("secondary_static"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_title");
      expect(f?.title).toBe("Title tag not detected in captured static HTML");
    });
  });

  describe("homepage-only scope prefix handling", () => {
    it("preserves homepage-only prefix while applying bounded title", () => {
      const auditRun = { id: "run-hp", homepageOnly: true };
      const { findings } = extractPageArtifacts(auditRun, makeSnap("static"), MINIMAL_HTML);
      const f = findFinding(findings, "missing_title");
      expect(f?.title).toMatch(/^Homepage-only audit: /);
      expect(f?.title).toContain("Title tag not detected in captured static HTML");
    });
  });

  describe("null captureMethod", () => {
    it("uses direct labels when captureMethod is null", () => {
      const { findings } = extractPageArtifacts(MINIMAL_AUDIT_RUN, makeSnap(null), MINIMAL_HTML);
      const f = findFinding(findings, "missing_title");
      expect(f?.title).toBe("Missing page title");
    });
  });
});
