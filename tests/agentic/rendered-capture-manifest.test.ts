import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

async function readRepoFile(filePath: string) {
  return readFile(path.join(repoRoot, filePath), "utf8");
}

// ─── workflow.yaml: rendered_capture step ────────────────────────────────────

describe("workflow.yaml — rendered_capture step", () => {
  it("workflow.yaml contains a rendered_capture workflow step", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    expect(manifest).toContain("id: rendered_capture");
  });

  it("rendered_capture references playwright_rendered_capture as its tool", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    expect(manifest).toContain("tool_id: playwright_rendered_capture");
  });

  it("rendered_capture has read_only permission class", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    const captureSection = manifest.slice(
      manifest.indexOf("id: rendered_capture"),
      manifest.indexOf("id: static_fallback")
    );
    expect(captureSection).toContain("permission_class: read_only");
  });

  it("rendered_capture declares static_fallback as fallback for blocked/timeout/failed", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    const captureSection = manifest.slice(
      manifest.indexOf("id: rendered_capture"),
      manifest.indexOf("id: static_fallback")
    );
    expect(captureSection).toContain("blocked");
    expect(captureSection).toContain("timeout");
    expect(captureSection).toContain("failed");
    expect(captureSection).toContain("static_fallback");
  });

  it("rendered_capture references the implementation file", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    expect(manifest).toContain("src/lib/capture/rendered-capture.ts");
  });
});

// ─── workflow.yaml: tool inventory ───────────────────────────────────────────

describe("workflow.yaml — tool inventory", () => {
  it("playwright_rendered_capture tool entry exists", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    expect(manifest).toContain("id: playwright_rendered_capture");
  });

  it("playwright_rendered_capture has read_only permission_class", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    const toolsSection = manifest.slice(
      manifest.indexOf("tools:"),
      manifest.indexOf("workflows:")
    );
    expect(toolsSection).toContain("permission_class: read_only");
  });

  it("playwright_rendered_capture declares forbidden interaction actions", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    const toolsSection = manifest.slice(
      manifest.indexOf("id: playwright_rendered_capture"),
      manifest.indexOf("id: static_capture_fallback")
    );
    expect(toolsSection).toContain("- click");
    expect(toolsSection).toContain("- fill");
    expect(toolsSection).toContain("- type");
    expect(toolsSection).toContain("- press");
    expect(toolsSection).toContain("- selectOption");
    expect(toolsSection).toContain("- setInputFiles");
    expect(toolsSection).toContain("- bypass_captcha");
    expect(toolsSection).toContain("- evade_bot_protection");
    expect(toolsSection).toContain("- submit_form");
  });

  it("playwright_rendered_capture lists allowed read-only actions", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    const toolsSection = manifest.slice(
      manifest.indexOf("id: playwright_rendered_capture"),
      manifest.indexOf("id: static_capture_fallback")
    );
    expect(toolsSection).toContain("navigate");
    expect(toolsSection).toContain("read_dom");
    expect(toolsSection).toContain("extract_visible_text");
    expect(toolsSection).toContain("classify_blocker");
    expect(toolsSection).toContain("take_desktop_screenshot");
  });

  it("playwright_rendered_capture is not_controlled_by prospect_audit_agent", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    const toolSection = manifest.slice(
      manifest.indexOf("id: playwright_rendered_capture"),
      manifest.indexOf("id: static_capture_fallback")
    );
    expect(toolSection).toContain("not_controlled_by");
    expect(toolSection).toContain("prospect_audit_agent");
  });

  it("playwright_rendered_capture declares output_schema: RenderedCaptureResult", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    expect(manifest).toContain("output_schema: RenderedCaptureResult");
  });
});

// ─── workflow.yaml: evidence_normalization step ───────────────────────────────

describe("workflow.yaml — evidence_normalization step", () => {
  it("evidence_normalization step exists", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    expect(manifest).toContain("id: evidence_normalization");
  });

  it("evidence_normalization sits between capture and evaluators", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    const normPos = manifest.indexOf("id: evidence_normalization");
    const evalPos = manifest.indexOf("id: evaluators");
    const capturePos = manifest.indexOf("id: rendered_capture");
    expect(capturePos).toBeLessThan(normPos);
    expect(normPos).toBeLessThan(evalPos);
  });
});

// ─── agents.yaml: Playwright constraints ─────────────────────────────────────

describe("agents.yaml — Playwright constraints for prospect_audit_agent", () => {
  it("prospect_audit_agent has permission_class: read_only", async () => {
    const manifest = await readRepoFile("agents.yaml");
    expect(manifest).toContain("permission_class: read_only");
  });

  it("prospect_audit_agent explicitly does NOT control playwright_rendered_capture", async () => {
    const manifest = await readRepoFile("agents.yaml");
    expect(manifest).toContain("does_not_control_tools:");
    expect(manifest).toContain("playwright_rendered_capture");
  });

  it("prospect_audit_agent consumes evidence_package, not raw Playwright output", async () => {
    const manifest = await readRepoFile("agents.yaml");
    expect(manifest).toContain("consumes:");
    expect(manifest).toContain("evidence_package");
  });

  it("prospect_audit_agent lists may_consume_evidence_from section", async () => {
    const manifest = await readRepoFile("agents.yaml");
    expect(manifest).toContain("may_consume_evidence_from:");
  });

  it("prospect_audit_agent has constraint forbidding direct browser control", async () => {
    const manifest = await readRepoFile("agents.yaml");
    expect(manifest).toContain("constraints:");
    expect(manifest).toContain("never controls the browser directly");
  });

  it("control_playwright_rendered_capture is in forbidden list", async () => {
    const manifest = await readRepoFile("agents.yaml");
    expect(manifest).toContain("control_playwright_rendered_capture");
  });
});

// ─── Implementation file exists ───────────────────────────────────────────────

describe("rendered capture implementation", () => {
  it("src/lib/capture/rendered-capture.ts exists", async () => {
    const source = await readRepoFile("src/lib/capture/rendered-capture.ts");
    expect(source.length).toBeGreaterThan(0);
  });

  it("implementation exports RenderedCaptureResult type contract", async () => {
    const source = await readRepoFile("src/lib/capture/rendered-capture.ts");
    expect(source).toContain("RenderedCaptureResult");
    expect(source).toContain("RenderedCaptureStatus");
    expect(source).toContain("BlockerKind");
    expect(source).toContain("classifyBlocker");
    expect(source).toContain("captureRenderedPage");
  });

  it("implementation declares NAVIGATION_TIMEOUT_MS and TOTAL_CAPTURE_TIMEOUT_MS", async () => {
    const source = await readRepoFile("src/lib/capture/rendered-capture.ts");
    expect(source).toContain("NAVIGATION_TIMEOUT_MS");
    expect(source).toContain("TOTAL_CAPTURE_TIMEOUT_MS");
  });

  it("implementation does not contain forbidden interaction methods", async () => {
    const source = await readRepoFile("src/lib/capture/rendered-capture.ts");
    const forbidden = ["page.click", "page.fill", "page.press", "page.type", ".selectOption(", ".setInputFiles("];
    for (const m of forbidden) {
      expect(source, `should not use ${m}`).not.toContain(m);
    }
  });
});

// ─── Report fidelity labels ───────────────────────────────────────────────────

describe("report fidelity labels", () => {
  it("report-presentation.ts recognises rendered_browser fidelity for Rendered audit badge", async () => {
    const source = await readRepoFile("src/lib/report-presentation.ts");
    expect(source).toContain("rendered_browser");
    expect(source).toContain("Rendered audit");
  });

  it("report-presentation.ts recognises static_public for Static fallback audit badge", async () => {
    const source = await readRepoFile("src/lib/report-presentation.ts");
    expect(source).toContain("static_public");
    expect(source).toContain("Static fallback audit");
  });

  it("report-presentation.ts recognises secondary_static for Partial/static audit badge", async () => {
    const source = await readRepoFile("src/lib/report-presentation.ts");
    expect(source).toContain("secondary_static");
    expect(source).toContain("Partial/static audit");
  });

  it("report-presentation.ts recognises blocked_no_evidence for Limited evidence audit badge", async () => {
    const source = await readRepoFile("src/lib/report-presentation.ts");
    expect(source).toContain("blocked_no_evidence");
    expect(source).toContain("Limited evidence audit");
  });
});
