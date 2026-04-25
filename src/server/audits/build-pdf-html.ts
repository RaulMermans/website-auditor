import type { FullReportData } from "@/server/audits/build-full-report";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function section(title: string, body: string): string {
  return `<section>
    <h2>${esc(title)}</h2>
    ${body}
  </section>`;
}

function bulletList(items: string[]): string {
  if (items.length === 0) return `<p class="muted">None recorded in this pass.</p>`;
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

export function buildPdfHtml(report: FullReportData, aiContextPack: string): string {
  const score = report.scoreSummary.overall;
  const scoreColor = score >= 75 ? "#166534" : score >= 55 ? "#92400e" : "#991b1b";

  const findingRows = report.topPriorities
    .map(
      (f, i) => `
    <div class="finding">
      <div class="finding-meta">
        <span class="badge badge-cat">${esc(f.categoryLabel)}</span>
        <span class="badge badge-sev">${esc(f.severity.toUpperCase())}</span>
        <span class="badge badge-ev">${esc(f.evidenceLevel)}</span>
        <span class="badge badge-claim">${esc(f.claimLabel)}</span>
      </div>
      <h3>#${i + 1} ${esc(f.title)}</h3>
      <p><strong>What:</strong> ${esc(f.summary)}</p>
      <p><strong>Risk:</strong> ${esc(f.risk)}</p>
      <p><strong>Next:</strong> ${esc(f.nextStep)}</p>
    </div>`
    )
    .join("");

  const categoryRows = report.categorySections
    .map((cat) => {
      const scoreStr = cat.score !== null ? `${cat.score}/100` : "—";
      return `<tr>
      <td>${esc(cat.label)}</td>
      <td>${scoreStr}</td>
      <td>${esc(cat.inspectionLabel)}</td>
      <td>${esc(cat.inspectionNote)}</td>
    </tr>`;
    })
    .join("");

  const ev = report.appendix.evidenceCounts;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Website Audit — ${esc(report.domain)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      color: #1a202c;
      line-height: 1.55;
      background: #fff;
    }
    .page { max-width: 750pt; margin: 0 auto; padding: 24pt 32pt; }
    h1 { font-size: 20pt; margin-bottom: 4pt; color: #0f172a; }
    h2 {
      font-size: 13pt;
      color: #0f172a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 4pt;
      margin: 20pt 0 10pt;
    }
    h3 { font-size: 10.5pt; margin: 6pt 0 4pt; color: #0f172a; }
    p { margin-bottom: 6pt; }
    ul { padding-left: 16pt; margin-bottom: 6pt; }
    li { margin-bottom: 3pt; }
    section { margin-bottom: 16pt; }
    .muted { color: #6b7280; font-style: italic; }
    .score-badge {
      display: inline-block;
      font-size: 28pt;
      font-weight: 700;
      color: ${scoreColor};
      background: #f0fdf4;
      border: 2px solid #86efac;
      border-radius: 8pt;
      padding: 6pt 14pt;
      margin: 8pt 0;
    }
    .finding {
      border: 1px solid #e2e8f0;
      border-radius: 6pt;
      padding: 10pt 12pt;
      margin-bottom: 8pt;
      page-break-inside: avoid;
    }
    .finding-meta { margin-bottom: 5pt; }
    .badge {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2pt 6pt;
      border-radius: 12pt;
      margin-right: 4pt;
    }
    .badge-cat { background: #eff6ff; color: #1d4ed8; }
    .badge-sev { background: #fef2f2; color: #dc2626; }
    .badge-ev { background: #f0fdf4; color: #166534; }
    .badge-claim { background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 6pt; }
    th {
      background: #f8fafc;
      text-align: left;
      padding: 6pt 8pt;
      border: 1px solid #e2e8f0;
      font-size: 9pt;
    }
    td { padding: 5pt 8pt; border: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .action-group { margin-bottom: 10pt; }
    .action-group-title { font-weight: 700; margin-bottom: 3pt; color: #374151; }
    .ev-row {
      display: inline-block;
      margin-right: 16pt;
      font-weight: 600;
    }
    .ev-count { font-size: 14pt; font-weight: 700; }
    .context-pack {
      background: #f8fafc;
      border: 1pt solid #cbd5e1;
      border-radius: 6pt;
      padding: 10pt 12pt;
      margin-top: 10pt;
    }
    .context-label {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 6pt;
    }
    pre {
      font-family: "Courier New", Courier, monospace;
      font-size: 8.5pt;
      white-space: pre-wrap;
      word-break: break-word;
      color: #1e293b;
      line-height: 1.5;
    }
    @page { margin: 2cm 1.5cm; size: A4; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
<div class="page">

  <h1>Website Audit: ${esc(report.domain)}</h1>
  <p class="muted">Run ID: ${esc(report.auditRunId)} &nbsp;·&nbsp; Scope: ${esc(report.appendix.scopeNote)}</p>

  <div class="score-badge">${score}/100</div>
  <p class="muted" style="margin-top:4pt">${esc(report.executiveSummary.inspectionFrame)}</p>

  ${section(
    "Executive Summary",
    `<p>${esc(report.executiveSummary.overview)}</p>
    <h3>What is working</h3>
    ${bulletList(report.executiveSummary.whatIsWorking)}
    <h3>What is limiting</h3>
    ${bulletList(report.executiveSummary.whatIsLimiting)}`
  )}

  ${section(
    `Top Priorities (${report.topPriorities.length} findings)`,
    report.topPriorities.length === 0
      ? `<p class="muted">No prioritized findings were generated in this pass.</p>`
      : findingRows
  )}

  ${section(
    "Category Scores",
    `<table>
      <thead><tr><th>Category</th><th>Score</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${categoryRows}</tbody>
    </table>`
  )}

  ${section(
    "Recommended Next Actions",
    `<div class="action-group">
      <div class="action-group-title">Quick wins</div>
      ${bulletList(report.nextActions.quickWins)}
    </div>
    <div class="action-group">
      <div class="action-group-title">Medium priority</div>
      ${bulletList(report.nextActions.mediumPriority)}
    </div>
    <div class="action-group">
      <div class="action-group-title">Strategic</div>
      ${bulletList(report.nextActions.strategic)}
    </div>`
  )}

  ${section(
    "Evidence Summary",
    `<p>
      <span class="ev-row"><span class="ev-count">${ev.Measured}</span> Measured</span>
      <span class="ev-row"><span class="ev-count">${ev.Observed}</span> Observed</span>
      <span class="ev-row"><span class="ev-count">${ev.Inferred}</span> Inferred</span>
    </p>
    <p class="muted">Measured = direct DOM/metric capture. Observed = visible pattern. Inferred = directional inference.</p>
    <p>Scope: ${esc(report.appendix.scopeNote)}</p>
    ${bulletList(report.appendix.inspectionNotes)}`
  )}

  <section>
    <h2>AI Context Pack — Portable Audit Context</h2>
    <p class="muted">Upload this section into a fresh ChatGPT (or similar) conversation to provide full audit context.</p>
    <div class="context-pack">
      <div class="context-label">Portable context for LLM upload</div>
      <pre>${esc(aiContextPack)}</pre>
    </div>
  </section>

</div>
</body>
</html>`;
}
