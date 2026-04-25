import type { FullReportData } from "@/server/audits/build-full-report";

export function buildAiContextPack(
  auditRunId: string,
  fullReport: FullReportData,
  completedAt: Date | null | undefined
): string {
  const lines: string[] = [];
  const ruler = "=".repeat(50);
  const dash = "-".repeat(40);

  lines.push("WEBSITE AUDIT — AI CONTEXT PACK");
  lines.push(ruler);
  lines.push(`Run ID   : ${auditRunId}`);
  lines.push(`Target   : ${fullReport.domain}`);
  lines.push(`Completed: ${completedAt ? new Date(completedAt).toUTCString() : "unknown"}`);
  lines.push(`Scope    : ${fullReport.appendix.scopeNote}`);
  lines.push("");

  lines.push("COVERAGE SUMMARY");
  lines.push(dash);
  lines.push(fullReport.executiveSummary.inspectionFrame);
  lines.push("");
  for (const note of fullReport.appendix.inspectionNotes) {
    lines.push(`  • ${note}`);
  }
  lines.push("");

  lines.push("OVERALL SCORE");
  lines.push(dash);
  lines.push(`Score: ${fullReport.scoreSummary.overall}/100`);
  lines.push(
    "Note: score reflects only inspected categories. Max attainable is 92 (not 100). " +
      "Uninspected areas contribute 0 and do not raise the score."
  );
  lines.push("");

  const topN = fullReport.topPriorities.slice(0, 6);
  lines.push(`TOP FINDINGS (${topN.length} of ${fullReport.topPriorities.length} shown)`);
  lines.push(dash);
  if (topN.length === 0) {
    lines.push("No prioritized findings were generated in this pass.");
  } else {
    topN.forEach((f, i) => {
      lines.push(
        `${i + 1}. [${f.severity.toUpperCase()} | ${f.evidenceLevel} | ${f.claimLabel}] ${f.categoryLabel}: ${f.title}`
      );
      lines.push(`   What: ${f.summary}`);
      lines.push(`   Risk: ${f.risk}`);
      lines.push(`   Next: ${f.nextStep}`);
      lines.push("");
    });
  }

  lines.push("KEY RECOMMENDATIONS");
  lines.push(dash);
  lines.push("Quick wins:");
  for (const item of fullReport.nextActions.quickWins) lines.push(`  • ${item}`);
  lines.push("Medium priority:");
  for (const item of fullReport.nextActions.mediumPriority) lines.push(`  • ${item}`);
  lines.push("Strategic:");
  for (const item of fullReport.nextActions.strategic) lines.push(`  • ${item}`);
  lines.push("");

  lines.push("EVIDENCE SUMMARY");
  lines.push(dash);
  const ev = fullReport.appendix.evidenceCounts;
  lines.push(`Measured: ${ev.Measured} | Observed: ${ev.Observed} | Inferred: ${ev.Inferred}`);
  lines.push(
    "Measured = direct DOM/metric capture. Observed = visible pattern. Inferred = directional inference."
  );
  lines.push("");

  lines.push("CONFIDENCE & LIMITATIONS");
  lines.push(dash);
  lines.push(
    "• 'No issue surfaced' means no issue was found in the signals checked — not that the area is definitively clean."
  );
  lines.push(
    "• Inferred findings are inference-backed directional risks, not confirmed defects."
  );
  lines.push(
    "• This audit covers specific deterministic signals; dynamic behavior, auth-gated pages, and full content were not assessed."
  );
  lines.push("");

  lines.push("HOW TO USE THIS PACK");
  lines.push(dash);
  lines.push(
    "Upload this PDF into a new ChatGPT (or similar) conversation to provide full audit context. " +
      "You can then ask follow-up questions about specific findings, prioritize fixes, or draft " +
      "implementation plans. Do not treat scores as absolute benchmarks — use them as relative " +
      "signals within this inspection scope."
  );

  return lines.join("\n");
}
