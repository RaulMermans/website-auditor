import { describe, expect, it } from "vitest";
import { extractPageArtifacts } from "@/server/audits/extract-page-evidence";

const RUN = { id: "run-1", homepageOnly: false };
const HOMEPAGE = { id: "snap-1", url: "https://example.com/", pageType: "homepage" as const };
const SERVICES = { id: "snap-2", url: "https://example.com/services", pageType: "services" as const };

function getEvidence<T>(items: { key: string; value: unknown }[], key: string) {
  return items.find((item) => item.key === key)?.value as T;
}

function getFindings(items: { title: string }[], titleSubstring: string) {
  return items.filter((f) => f.title.toLowerCase().includes(titleSubstring.toLowerCase()));
}

// ── Trust signals ─────────────────────────────────────────────────────────────

describe("trust signal evidence and findings", () => {
  it("emits trust_signals evidence for every page", () => {
    const result = extractPageArtifacts(RUN, HOMEPAGE, "<html><body><p>Hello</p></body></html>");
    const ev = getEvidence<{ density: number }>(result.pageEvidence, "trust_signals");
    expect(ev).toBeDefined();
    expect(typeof ev.density).toBe("number");
  });

  it("detects testimonial blockquote", () => {
    const html = `<html><body><blockquote>Great service!</blockquote></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ testimonials: boolean }>(result.pageEvidence, "trust_signals");
    expect(ev.testimonials).toBe(true);
  });

  it("detects phone number as contact info", () => {
    const html = `<html><body><a href="tel:+15551234567">Call us</a></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ contactInfo: boolean }>(result.pageEvidence, "trust_signals");
    expect(ev.contactInfo).toBe(true);
  });

  it("emits contact_reassurance evidence with contact depth details", () => {
    const html = `<html><body><a href="mailto:hello@example.com">Email</a><a href="/contact">Contact</a></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ contactOptions: number }>(result.pageEvidence, "contact_reassurance");
    expect(ev.contactOptions).toBeGreaterThan(0);
  });

  it("detects privacy link", () => {
    const html = `<html><body><a href="/privacy">Privacy Policy</a></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ privacyLink: boolean }>(result.pageEvidence, "trust_signals");
    expect(ev.privacyLink).toBe(true);
  });

  it("emits low-trust finding on homepage with density <= 1", () => {
    const html = `<html><head><title>My Site</title></head><body><h1>Welcome</h1></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const trustFindings = getFindings(result.findings, "trust signal density");
    expect(trustFindings.length).toBeGreaterThan(0);
  });

  it("does NOT emit low-trust finding when density > 1", () => {
    const html = `
      <html><body>
        <blockquote>Loved it!</blockquote>
        <a href="tel:+15551234567">Call</a>
        <p>Trusted by 500+ companies</p>
        <a href="/privacy">Privacy</a>
      </body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const trustFindings = getFindings(result.findings, "trust signal density");
    expect(trustFindings).toHaveLength(0);
  });

  it("does NOT emit low-trust finding on 'about' page", () => {
    const snap = { id: "snap-3", url: "https://example.com/about", pageType: "about" as const };
    const html = `<html><body><h1>About us</h1></body></html>`;
    const result = extractPageArtifacts(RUN, snap, html);
    const trustFindings = getFindings(result.findings, "trust signal density");
    expect(trustFindings).toHaveLength(0);
  });
});

// ── CTA inventory ─────────────────────────────────────────────────────────────

describe("CTA inventory evidence and findings", () => {
  it("emits cta_inventory evidence", () => {
    const html = `<html><body><button>Get Started</button></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ count: number }>(result.pageEvidence, "cta_inventory");
    expect(ev).toBeDefined();
    expect(ev.count).toBeGreaterThan(0);
  });

  it("detects duplicate CTA labels (3+ same text)", () => {
    const html = `
      <html><body>
        <button>Get Started</button>
        <button>Get Started</button>
        <button>Get Started</button>
      </body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ hasDuplicates: boolean }>(result.pageEvidence, "cta_inventory");
    expect(ev.hasDuplicates).toBe(true);
    const findingList = getFindings(result.findings, "repeated cta");
    expect(findingList.length).toBeGreaterThan(0);
  });

  it("emits CTA overload finding when count > 6", () => {
    const buttons = Array.from({ length: 7 }, (_, i) => `<button>Book a demo ${i}</button>`).join("");
    const html = `<html><body>${buttons}</body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const overloadFindings = getFindings(result.findings, "cta overload");
    expect(overloadFindings.length).toBeGreaterThan(0);
  });

  it("emits competing CTA hierarchy finding when multiple distinct actions are present", () => {
    const html = `
      <html><body>
        <button>Book a call</button>
        <button>Get started</button>
        <a href="/demo">Request demo</a>
        <a href="/contact">Contact us</a>
      </body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const competingFindings = getFindings(result.findings, "primary and secondary actions compete");
    expect(competingFindings.length).toBeGreaterThan(0);
  });
});

// ── Form friction ─────────────────────────────────────────────────────────────

describe("form friction evidence and findings", () => {
  it("emits form_friction evidence when form present", () => {
    const html = `
      <html><body>
        <form>
          <input type="text"><input type="email"><input type="tel">
        </form>
      </body></html>`;
    const result = extractPageArtifacts(RUN, SERVICES, html);
    const ev = getEvidence<{ fieldCount: number }>(result.pageEvidence, "form_friction");
    expect(ev.fieldCount).toBe(3);
  });

  it("emits high-friction finding when form has more than 6 fields", () => {
    const inputs = Array.from({ length: 7 }, (_, i) => `<input type="text" name="field${i}">`).join("");
    const html = `<html><body><form>${inputs}</form></body></html>`;
    const result = extractPageArtifacts(RUN, SERVICES, html);
    const frictionFindings = getFindings(result.findings, "long form");
    expect(frictionFindings.length).toBeGreaterThan(0);
    expect(frictionFindings[0]).toMatchObject({ category: "conversion", severity: "medium" });
  });

  it("does NOT emit friction finding for small form", () => {
    const html = `<html><body><form><input type="email"><input type="text"></form></body></html>`;
    const result = extractPageArtifacts(RUN, SERVICES, html);
    const frictionFindings = getFindings(result.findings, "long form");
    expect(frictionFindings).toHaveLength(0);
  });

  it("does not count hidden/submit/button inputs as fields", () => {
    const html = `
      <html><body>
        <form>
          <input type="text">
          <input type="hidden" name="csrf">
          <input type="submit" value="Submit">
        </form>
      </body></html>`;
    const result = extractPageArtifacts(RUN, SERVICES, html);
    const ev = getEvidence<{ fieldCount: number }>(result.pageEvidence, "form_friction");
    expect(ev.fieldCount).toBe(1);
  });
});

// ── Messaging quality ─────────────────────────────────────────────────────────

describe("messaging quality evidence and findings", () => {
  it("emits messaging_quality evidence", () => {
    const html = `<html><body><h1>Hero text</h1></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ genericIntroDetected: boolean }>(result.pageEvidence, "messaging_quality");
    expect(ev).toBeDefined();
  });

  it("emits messaging_alignment evidence for richer narrative checks", () => {
    const html = `
      <html>
        <head><title>Lead generation for home services</title></head>
        <body>
          <h1>We are a digital agency</h1>
          <h2>SEO</h2>
          <h2>PPC</h2>
          <h2>Web Design</h2>
        </body>
      </html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ titleAlignment: number }>(result.pageEvidence, "messaging_alignment");
    expect(ev.titleAlignment).toBeLessThan(0.5);
  });

  it("detects generic 'Welcome to our' intro on homepage", () => {
    const html = `<html><body><h1>Welcome to our agency</h1><p>We build websites.</p></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ genericIntroDetected: boolean }>(result.pageEvidence, "messaging_quality");
    expect(ev.genericIntroDetected).toBe(true);

    const msgFindings = getFindings(result.findings, "value proposition");
    expect(msgFindings.length).toBeGreaterThan(0);
    expect(msgFindings[0]).toMatchObject({ category: "messaging_content", severity: "high" });
  });

  it("detects 'We are a' generic intro", () => {
    const html = `<html><body><h1>We are a digital marketing company</h1></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ genericIntroDetected: boolean }>(result.pageEvidence, "messaging_quality");
    expect(ev.genericIntroDetected).toBe(true);
  });

  it("does NOT flag specific value-proposition opening", () => {
    const html = `<html><body><h1>Double your leads in 90 days or your money back</h1></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<{ genericIntroDetected: boolean }>(result.pageEvidence, "messaging_quality");
    expect(ev.genericIntroDetected).toBe(false);
    const msgFindings = getFindings(result.findings, "value proposition");
    expect(msgFindings).toHaveLength(0);
  });

  it("does NOT emit weak-value-proposition finding on non-homepage pages", () => {
    const snap = { id: "snap-3", url: "https://example.com/about", pageType: "about" as const };
    const html = `<html><body><h1>Welcome to our company</h1></body></html>`;
    const result = extractPageArtifacts(RUN, snap, html);
    const msgFindings = getFindings(result.findings, "value proposition");
    expect(msgFindings).toHaveLength(0);
  });

  it("emits offer-sprawl messaging finding when the homepage broadens too quickly", () => {
    const headings = [
      "SEO services",
      "Paid ads",
      "Web design",
      "Brand strategy",
      "Content marketing",
      "Analytics",
      "Sales enablement",
    ]
      .map((text) => `<h2>${text}</h2>`)
      .join("");
    const html = `<html><body><h1>Grow faster</h1>${headings}</body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const msgFindings = getFindings(result.findings, "too many themes");
    expect(msgFindings.length).toBeGreaterThan(0);
  });
});

// ── Performance ───────────────────────────────────────────────────────────────

describe("performance script count evidence and findings", () => {
  it("emits script_count evidence", () => {
    const html = `<html><head><script src="a.js"></script></head><body></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const ev = getEvidence<number>(result.pageEvidence, "script_count");
    expect(ev).toBe(1);
  });

  it("does NOT emit perf finding for low script count", () => {
    const scripts = Array.from({ length: 5 }, (_, i) => `<script src="s${i}.js"></script>`).join("");
    const html = `<html><head>${scripts}</head><body></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const perfFindings = getFindings(result.findings, "heavy script");
    expect(perfFindings).toHaveLength(0);
  });

  it("emits perf finding when script count > 15", () => {
    const scripts = Array.from({ length: 16 }, (_, i) => `<script src="s${i}.js"></script>`).join("");
    const html = `<html><head>${scripts}</head><body></body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const perfFindings = getFindings(result.findings, "heavy script");
    expect(perfFindings.length).toBeGreaterThan(0);
    expect(perfFindings[0]).toMatchObject({ category: "performance", evidenceLevel: "Measured" });
  });

  it("emits asset_weight and page_complexity evidence for performance semantics", () => {
    const scripts = Array.from({ length: 6 }, (_, i) => `<script src="https://cdn.example.com/s${i}.js"></script>`).join("");
    const images = Array.from({ length: 12 }, (_, i) => `<img src="/img-${i}.jpg">`).join("");
    const sections = Array.from({ length: 8 }, (_, i) => `<section><h2>Section ${i}</h2><p>${"copy ".repeat(40)}</p></section>`).join("");
    const html = `<html><head>${scripts}<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css"><link rel="stylesheet" href="/c.css"><link rel="stylesheet" href="/d.css"><link rel="stylesheet" href="/e.css"></head><body>${images}${sections}</body></html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    expect(getEvidence(result.pageEvidence, "asset_weight")).toBeDefined();
    expect(getEvidence(result.pageEvidence, "page_complexity")).toBeDefined();
  });
});

describe("ux/ui and mobile structural evidence", () => {
  it("emits content_hierarchy and mobile_layout evidence", () => {
    const html = `
      <html>
        <body>
          <h1>Welcome to our agency</h1>
          <button>Book now</button>
          <button>Book now</button>
          <button>See pricing</button>
          ${Array.from({ length: 8 }, (_, i) => `<section><h2>Section ${i}</h2><p>${"copy ".repeat(40)}</p></section>`).join("")}
        </body>
      </html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    expect(getEvidence(result.pageEvidence, "content_hierarchy")).toBeDefined();
    expect(getEvidence(result.pageEvidence, "mobile_layout")).toBeDefined();
  });

  it("emits ux/ui findings for a busy homepage flow", () => {
    const html = `
      <html>
        <body>
          <h1>Welcome to our agency</h1>
          <button>Book now</button>
          <button>Book now</button>
          <button>See pricing</button>
          <form>${Array.from({ length: 7 }, () => `<input type="text">`).join("")}</form>
          ${Array.from({ length: 8 }, (_, i) => `<section><h2>Section ${i}</h2><p>${"copy ".repeat(40)}</p></section>`).join("")}
        </body>
      </html>`;
    const result = extractPageArtifacts(RUN, HOMEPAGE, html);
    const uxFindings = result.findings.filter((finding) => finding.category === "ux_ui");
    expect(uxFindings.length).toBeGreaterThan(0);
  });
});
