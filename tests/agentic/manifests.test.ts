import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

async function readRepoFile(filePath: string) {
  return readFile(path.join(repoRoot, filePath), "utf8");
}

function referencedPaths(manifest: string) {
  return [...manifest.matchAll(/(?:^|\s)(?:-\s+)?((?:src|docs)\/[^\s"'`]+|(?:agents|workflow)\.yaml)/gm)]
    .map((match) => match[1])
    .filter(Boolean);
}

describe("agentic workflow manifests", () => {
  it("workflow.yaml exists and references real files or directories", async () => {
    const manifest = await readRepoFile("workflow.yaml");

    expect(manifest).toContain("deterministic_workflow_with_llm_synthesis");
    expect(manifest).toContain("truth_source: deterministic_audit_engine");
    expect(manifest).toContain("bounded_llm_synthesis_agent");
    expect(manifest).not.toContain("sk-");

    for (const filePath of referencedPaths(manifest)) {
      const absolute = path.join(repoRoot, filePath);
      expect(existsSync(absolute), `${filePath} should exist`).toBe(true);
      expect(statSync(absolute).isFile() || statSync(absolute).isDirectory()).toBe(true);
    }
  });

  it("agents.yaml exists and references real files", async () => {
    const manifest = await readRepoFile("agents.yaml");

    expect(manifest).toContain("prospect_audit_agent");
    expect(manifest).toContain("accepted_findings");
    expect(manifest).toContain("create_audit_truth");
    expect(manifest).not.toContain("sk-");

    for (const filePath of referencedPaths(manifest)) {
      const absolute = path.join(repoRoot, filePath);
      expect(existsSync(absolute), `${filePath} should exist`).toBe(true);
    }
  });

  it("workflow.yaml declares rendered_capture as a workflow step with read_only permission", async () => {
    const manifest = await readRepoFile("workflow.yaml");
    expect(manifest).toContain("id: rendered_capture");
    expect(manifest).toContain("tool_id: playwright_rendered_capture");
    expect(manifest).toContain("id: evidence_normalization");
    expect(manifest).toContain("id: static_fallback");
  });

  it("agents.yaml documents that the prospect_audit_agent does not control Playwright", async () => {
    const manifest = await readRepoFile("agents.yaml");
    expect(manifest).toContain("does_not_control_tools:");
    expect(manifest).toContain("playwright_rendered_capture");
    expect(manifest).toContain("permission_class: read_only");
  });

  it("prompt governance docs and prompt marker exist", async () => {
    await expect(readRepoFile("docs/agentic/architecture.md")).resolves.toContain(
      "hybrid AI workflow"
    );
    await expect(readRepoFile("docs/agentic/prompts.md")).resolves.toContain(
      "Prompt Inventory"
    );
    await expect(
      readRepoFile("src/server/agents/prospect-audit-agent.prompt.ts")
    ).resolves.toContain("@agent-prompt prospect_audit_agent");
  });
});
