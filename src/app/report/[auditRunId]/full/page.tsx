import Link from "next/link";
import { notFound } from "next/navigation";
import { reportRepository } from "@/db/report";
import {
  CATEGORY_LABELS,
  EVIDENCE_COLORS,
  REVIEW_STATE_META,
  scoreColor,
  SEVERITY_COLORS,
} from "@/lib/report-presentation";
import { buildFullReportData } from "@/server/audits/build-full-report";

function renderStatList(items: string[], emptyLabel: string) {
  if (items.length === 0) {
    return <p style={{ color: "#6b7280", margin: 0 }}>{emptyLabel}</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 18, color: "#374151" }}>
      {items.map((item) => (
        <li key={item} style={{ marginBottom: 6 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function renderCountRow(label: string, value: number, color: string) {
  return (
    <div
      key={label}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 8,
        background: "#fff",
        border: "1px solid #e5e7eb",
      }}
    >
      <span style={{ color: "#374151", fontWeight: 600 }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

export default async function FullReportPage({
  params,
}: {
  params: Promise<{ auditRunId: string }>;
}) {
  const { auditRunId } = await params;
  const data = await reportRepository.getReportData(auditRunId);

  if (!data) {
    notFound();
  }

  const fullReport = buildFullReportData(data);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f6f1e8 0%, #fbfaf7 220px, #ffffff 220px)",
        padding: "48px 24px 80px",
      }}
    >
      <article
        style={{
          maxWidth: 980,
          margin: "0 auto",
          color: "#1f2937",
          fontFamily: 'Georgia, Cambria, "Times New Roman", serif',
          lineHeight: 1.65,
        }}
      >
        <header
          style={{
            marginBottom: 32,
            padding: "28px 32px",
            borderRadius: 20,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(148, 163, 184, 0.25)",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#92400e",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  fontWeight: 700,
                }}
              >
                Full Audit Report
              </p>
              <h1 style={{ margin: "8px 0 4px", fontSize: "2.5rem", lineHeight: 1.1 }}>
                {fullReport.domain}
              </h1>
              <p
                style={{
                  margin: 0,
                  color: "#6b7280",
                  fontSize: "0.95rem",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                Run: {auditRunId} · Status: {data.auditRun.status}
                {data.auditRun.completedAt
                  ? ` · Completed: ${new Date(data.auditRun.completedAt).toLocaleString()}`
                  : ""}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              <Link
                href={`/report/${auditRunId}`}
                style={{
                  textDecoration: "none",
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid #cbd5e1",
                  color: "#334155",
                  fontWeight: 600,
                  background: "#fff",
                }}
              >
                Concise view
              </Link>
              <a
                href="#summary"
                style={{
                  textDecoration: "none",
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid #bfdbfe",
                  color: "#1d4ed8",
                  fontWeight: 600,
                  background: "#eff6ff",
                }}
              >
                Start reading
              </a>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)",
              gap: 20,
              alignItems: "center",
            }}
          >
            <div
              style={{
                padding: 20,
                borderRadius: 18,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "3.25rem",
                  fontWeight: 700,
                  color: scoreColor(fullReport.scoreSummary.overall),
                  lineHeight: 1,
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                {fullReport.scoreSummary.overall}
              </div>
              <p
                style={{
                  margin: "10px 0 0",
                  color: "#475569",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                Overall score
              </p>
            </div>

            <div>
              <p style={{ marginTop: 0, marginBottom: 12, fontSize: "1.03rem" }}>
                {fullReport.executiveSummary.overview}
              </p>
              <p
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  color: "#475569",
                  fontSize: "0.9rem",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                {fullReport.appendix.scopeNote}
              </p>
            </div>
          </div>

          <nav
            style={{
              marginTop: 22,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            {[
              ["summary", "Executive Summary"],
              ["priorities", "Top Priorities"],
              ["scores", "Score Summary"],
              ["categories", "Category Review"],
              ["strategic", "Strategic Readout"],
              ["actions", "Next Actions"],
              ["appendix", "Appendix"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                style={{
                  textDecoration: "none",
                  color: "#334155",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <section
          id="reader-guide"
          style={{
            marginBottom: 34,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
            scrollMarginTop: 24,
          }}
        >
          <div
            style={{
              padding: 18,
              borderRadius: 16,
              background: "#fff",
              border: "1px solid #e5e7eb",
            }}
          >
            <h2
              style={{
                margin: "0 0 10px",
                fontSize: "1rem",
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              Reading Guide
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["#summary", "Executive Summary", "Read this first for the main conclusion and coverage frame."],
                ["#priorities", "Top Priorities", "Use this when you need the clearest issues and next moves fast."],
                ["#scores", "Score Summary", "Check status labels before interpreting category scores."],
                ["#categories", "Category Review", "Read here when you want the detailed evidence-backed reasoning."],
                ["#strategic", "Strategic Readout", "Use this for the consultant-style thematic synthesis."],
                ["#actions", "Next Actions", "This is the most direct implementation-oriented view."],
                ["#appendix", "Appendix", "Open this for scope, evidence mix, and inspection notes."],
              ].map(([href, label, note]) => (
                <a
                  key={href}
                  href={href}
                  style={{
                    textDecoration: "none",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    color: "#334155",
                  }}
                >
                  <strong>{label}</strong>
                  <span style={{ display: "block", marginTop: 4, color: "#64748b", fontSize: "0.84rem" }}>
                    {note}
                  </span>
                </a>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: 18,
              borderRadius: 16,
              background: "#fff",
              border: "1px solid #e5e7eb",
            }}
          >
            <h2
              style={{
                margin: "0 0 10px",
                fontSize: "1rem",
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              How To Read Status
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {Object.values(REVIEW_STATE_META).map((meta) => (
                <div
                  key={meta.label}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: meta.background,
                    border: `1px solid ${meta.border}`,
                    color: meta.text,
                  }}
                >
                  <strong>{meta.label}</strong>
                  <span style={{ display: "block", marginTop: 4, fontSize: "0.84rem", lineHeight: 1.5 }}>
                    {meta.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="summary" style={{ marginBottom: 34, scrollMarginTop: 24 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "1.6rem",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Executive Summary
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            <div
              style={{
                padding: 18,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  fontSize: "1rem",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                What is working
              </h3>
              {renderStatList(
                fullReport.executiveSummary.whatIsWorking,
                "The current pass did not surface clearly clean categories."
              )}
            </div>
            <div
              style={{
                padding: 18,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  fontSize: "1rem",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                What is limiting performance or clarity
              </h3>
              {renderStatList(
                fullReport.executiveSummary.whatIsLimiting,
                "No prioritized limiting factors were surfaced in the current pass."
              )}
            </div>
          </div>
          <p
            style={{
              marginTop: 16,
              padding: "14px 16px",
              borderRadius: 14,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e40af",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontSize: "0.9rem",
            }}
          >
            {fullReport.executiveSummary.inspectionFrame}
          </p>
        </section>

        <section id="priorities" style={{ marginBottom: 34, scrollMarginTop: 24 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "1.6rem",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Top Priorities
          </h2>
          {fullReport.topPriorities.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280" }}>
              No prioritized issues were surfaced in the current deterministic findings set.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              {fullReport.topPriorities.map((finding, index) => (
                <article
                  key={finding.id}
                  style={{
                    padding: 22,
                    borderRadius: 18,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginBottom: 12,
                      fontFamily:
                        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }}
                  >
                    <span style={{ color: "#6b7280", fontWeight: 700 }}>#{index + 1}</span>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {finding.categoryLabel}
                    </span>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: `${SEVERITY_COLORS[finding.severity]}1a`,
                        color: SEVERITY_COLORS[finding.severity],
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {finding.severity.toUpperCase()}
                    </span>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: `${EVIDENCE_COLORS[finding.evidenceLevel]}1a`,
                        color: EVIDENCE_COLORS[finding.evidenceLevel],
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {finding.evidenceLevel} · {finding.confidence}
                    </span>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        color: "#475569",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {finding.supportLabel}
                    </span>
                  </div>
                  <h3 style={{ margin: "0 0 10px", fontSize: "1.25rem" }}>{finding.title}</h3>
                  <p style={{ margin: "0 0 10px", color: "#374151" }}>
                    <strong>What we found:</strong> {finding.summary}
                  </p>
                  <p style={{ margin: "0 0 10px", color: "#374151" }}>
                    <strong>Why it matters:</strong> {finding.whyItMatters}
                  </p>
                  <p style={{ margin: "0 0 10px", color: "#374151" }}>
                    <strong>Risk if unchanged:</strong> {finding.risk}
                  </p>
                  <p style={{ margin: "0 0 10px", color: "#065f46" }}>
                    <strong>Recommended move:</strong> {finding.nextStep}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      color: "#6b7280",
                      fontSize: "0.88rem",
                      fontFamily:
                        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }}
                  >
                    Evidence framing: {finding.evidenceNote} Support: {finding.supportLabel}.
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="scores" style={{ marginBottom: 34, scrollMarginTop: 24 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "1.6rem",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Score Summary
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: 18,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <p
                style={{
                  marginTop: 0,
                  color: "#6b7280",
                  fontSize: "0.85rem",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                Category scores are only shown where the current pass had enough deterministic evidence to score them honestly.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                {fullReport.categorySections.map((section) => (
                  <div
                    key={section.category}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 12,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      opacity: section.score === null ? 0.65 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.45rem",
                        fontWeight: 700,
                        color: section.score === null ? "#94a3b8" : scoreColor(section.score),
                        fontFamily:
                          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}
                    >
                      {section.score ?? "—"}
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#1f2937",
                        fontSize: "0.88rem",
                        fontFamily:
                          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}
                    >
                      {CATEGORY_LABELS[section.category]}
                    </div>
                    <div
                      style={{
                        color: "#6b7280",
                        fontSize: "0.8rem",
                        fontFamily:
                          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}
                    >
                      {section.inspectionLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  padding: 18,
                  borderRadius: 16,
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontWeight: 700,
                    color: "#166534",
                    fontFamily:
                      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }}
                >
                  Inspected and clean
                </p>
                <p style={{ margin: 0, color: "#166534" }}>
                  {fullReport.scoreSummary.inspectedCleanCategories.length > 0
                    ? fullReport.scoreSummary.inspectedCleanCategories.join(", ")
                    : "None"}
                </p>
              </div>
              <div
                style={{
                  padding: 18,
                  borderRadius: 16,
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontWeight: 700,
                    color: "#92400e",
                    fontFamily:
                      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }}
                >
                  Lightly inspected
                </p>
                <p style={{ margin: 0, color: "#92400e" }}>
                  {fullReport.scoreSummary.lightlyInspectedCategories.length > 0
                    ? fullReport.scoreSummary.lightlyInspectedCategories.join(", ")
                    : "None"}
                </p>
              </div>
              <div
                style={{
                  padding: 18,
                  borderRadius: 16,
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontWeight: 700,
                    color: "#475569",
                    fontFamily:
                      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }}
                >
                  Insufficient evidence
                </p>
                <p style={{ margin: 0, color: "#475569" }}>
                  {fullReport.scoreSummary.insufficientEvidenceCategories.length > 0
                    ? fullReport.scoreSummary.insufficientEvidenceCategories.join(", ")
                    : "None"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="categories" style={{ marginBottom: 34, scrollMarginTop: 24 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "1.6rem",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Category-by-Category Review
          </h2>
          <div style={{ display: "grid", gap: 18 }}>
            {fullReport.categorySections.map((section) => {
              const reviewMeta =
                section.inspectionStatus === "not_inspected"
                  ? REVIEW_STATE_META.insufficient_evidence
                  : section.inspectionStatus === "lightly_inspected"
                    ? REVIEW_STATE_META.lightly_inspected
                    : section.findings.length > 0
                      ? REVIEW_STATE_META.inspected_with_findings
                      : REVIEW_STATE_META.inspected_clean;

              return (
                <section
                  key={section.category}
                  id={`category-${section.category}`}
                  style={{
                    padding: 22,
                    borderRadius: 18,
                    background: "#fff",
                    border: `1px solid ${reviewMeta.border}`,
                    scrollMarginTop: 24,
                  }}
                >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.25rem",
                        fontFamily:
                          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}
                    >
                      {section.label}
                    </h3>
                    <p
                      style={{
                        margin: "6px 0 0",
                        color: "#6b7280",
                        fontSize: "0.85rem",
                        fontFamily:
                          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}
                    >
                      {section.inspectionLabel}
                      {section.score !== null ? ` · ${section.score}/100` : ""}
                    </p>
                  </div>
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      background: reviewMeta.background,
                      border: `1px solid ${reviewMeta.border}`,
                      color: reviewMeta.text,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      fontFamily:
                        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }}
                  >
                    {section.inspectionNote}
                  </div>
                </div>
                <p style={{ marginTop: 0, marginBottom: 14 }}>{section.interpretation}</p>

                {section.recommendations.length > 0 && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: "14px 16px",
                      borderRadius: 14,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontWeight: 700,
                        fontFamily:
                          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }}
                    >
                      Recommended moves
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {section.recommendations.map((recommendation) => (
                        <li key={recommendation} style={{ marginBottom: 6 }}>
                          {recommendation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {section.findings.length > 0 ? (
                  <div style={{ display: "grid", gap: 14 }}>
                    {section.findings.map((finding) => (
                      <article
                        key={finding.id}
                        style={{
                          padding: 18,
                          borderRadius: 14,
                          background: "#fcfcfb",
                          border: "1px solid #eceff3",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            alignItems: "center",
                            marginBottom: 10,
                            fontFamily:
                              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          }}
                        >
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: `${SEVERITY_COLORS[finding.severity]}1a`,
                              color: SEVERITY_COLORS[finding.severity],
                              fontWeight: 700,
                              fontSize: "0.72rem",
                            }}
                          >
                            {finding.severity.toUpperCase()}
                          </span>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: `${EVIDENCE_COLORS[finding.evidenceLevel]}1a`,
                              color: EVIDENCE_COLORS[finding.evidenceLevel],
                              fontWeight: 700,
                              fontSize: "0.72rem",
                            }}
                            >
                              {finding.evidenceLevel} · {finding.confidence}
                            </span>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                color: "#475569",
                                fontWeight: 700,
                                fontSize: "0.72rem",
                              }}
                            >
                              {finding.supportLabel}
                            </span>
                          </div>
                        <h4 style={{ margin: "0 0 8px", fontSize: "1.02rem" }}>
                          {finding.title}
                        </h4>
                        <p style={{ margin: "0 0 8px", color: "#374151" }}>
                          <strong>What we found:</strong> {finding.summary}
                        </p>
                        <p style={{ margin: "0 0 8px", color: "#374151" }}>
                          <strong>Why it matters:</strong> {finding.whyItMatters}
                        </p>
                        <p style={{ margin: "0 0 8px", color: "#374151" }}>
                          <strong>Risk if unchanged:</strong> {finding.risk}
                        </p>
                        <p style={{ margin: "0 0 8px", color: "#065f46" }}>
                          <strong>Next step:</strong> {finding.nextStep}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            color: "#6b7280",
                            fontSize: "0.85rem",
                            fontFamily:
                              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          }}
                        >
                          Evidence framing: {finding.evidenceNote} Support: {finding.supportLabel}.
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p style={{ marginBottom: 0, color: "#6b7280" }}>
                    No prioritized findings are listed for this category beyond the inspection note above.
                  </p>
                )}
                </section>
              );
            })}
          </div>
        </section>

        <section id="strategic" style={{ marginBottom: 34, scrollMarginTop: 24 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "1.6rem",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Strategic Readout
          </h2>
          <div style={{ display: "grid", gap: 14 }}>
            {fullReport.strategicReadout.map((item) => (
              <article
                key={item.title}
                style={{
                  padding: 18,
                  borderRadius: 16,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 8px",
                    fontSize: "1rem",
                    fontFamily:
                      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ margin: 0 }}>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="actions" style={{ marginBottom: 34, scrollMarginTop: 24 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "1.6rem",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Recommended Next Actions
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            {[
              ["Quick wins", fullReport.nextActions.quickWins, "#166534", "#f0fdf4", "#bbf7d0"],
              ["Medium-priority fixes", fullReport.nextActions.mediumPriority, "#92400e", "#fffbeb", "#fde68a"],
              ["Deeper strategic improvements", fullReport.nextActions.strategic, "#1e3a8a", "#eff6ff", "#bfdbfe"],
            ].map(([label, items, text, background, border]) => (
              <div
                key={label as string}
                style={{
                  padding: 18,
                  borderRadius: 16,
                  background: background as string,
                  border: `1px solid ${border as string}`,
                }}
              >
                <h3
                  style={{
                    margin: "0 0 10px",
                    color: text as string,
                    fontSize: "1rem",
                    fontFamily:
                      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }}
                >
                  {label}
                </h3>
                <ul style={{ margin: 0, paddingLeft: 18, color: text as string }}>
                  {(items as string[]).map((item) => (
                    <li key={item} style={{ marginBottom: 8 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="appendix" style={{ scrollMarginTop: 24 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "1.6rem",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            Appendix / Evidence Notes
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            <div
              style={{
                padding: 18,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: "1rem",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                Evidence levels
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                {renderCountRow("Measured", fullReport.appendix.evidenceCounts.Measured, EVIDENCE_COLORS.Measured)}
                {renderCountRow("Observed", fullReport.appendix.evidenceCounts.Observed, EVIDENCE_COLORS.Observed)}
                {renderCountRow("Inferred", fullReport.appendix.evidenceCounts.Inferred, EVIDENCE_COLORS.Inferred)}
              </div>
            </div>

            <div
              style={{
                padding: 18,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: "1rem",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                Severity mix
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                {renderCountRow("Critical", fullReport.appendix.severityCounts.critical, SEVERITY_COLORS.critical)}
                {renderCountRow("High", fullReport.appendix.severityCounts.high, SEVERITY_COLORS.high)}
                {renderCountRow("Medium", fullReport.appendix.severityCounts.medium, SEVERITY_COLORS.medium)}
                {renderCountRow("Low", fullReport.appendix.severityCounts.low, SEVERITY_COLORS.low)}
                {renderCountRow("Info", fullReport.appendix.severityCounts.info, SEVERITY_COLORS.info)}
              </div>
            </div>

            <div
              style={{
                padding: 18,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: "1rem",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                Inspection notes
              </h3>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#374151" }}>
                {fullReport.appendix.inspectionNotes.map((note) => (
                  <li key={note} style={{ marginBottom: 8 }}>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
