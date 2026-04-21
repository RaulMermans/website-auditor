import Link from "next/link";
import { notFound } from "next/navigation";
import { reportRepository } from "@/db/report";
import { enrichmentRepository } from "@/db/enrichment";
import type { OutreachAsset } from "@/lib/types";
import {
  CATEGORY_LABELS,
  EVIDENCE_COLORS,
  getFindingSupportLabel,
  scoreColor,
  SEVERITY_COLORS,
  stripHomepageScopePrefix,
} from "@/lib/report-presentation";

const REVIEW_STATE_STYLES = {
  inspected_clean: {
    background: "#f0fdf4",
    border: "#86efac",
    text: "#166534",
  },
  inspected_with_findings: {
    background: "#fff7ed",
    border: "#fdba74",
    text: "#9a3412",
  },
  lightly_inspected: {
    background: "#fffbeb",
    border: "#fcd34d",
    text: "#92400e",
  },
  insufficient_evidence: {
    background: "#f8fafc",
    border: "#cbd5e1",
    text: "#475569",
  },
} as const;

export default async function ReportPage({
  params,
}: {
  params: Promise<{ auditRunId: string }>;
}) {
  const { auditRunId } = await params;
  const [data, enrichmentAssets] = await Promise.all([
    reportRepository.getReportData(auditRunId),
    enrichmentRepository.getAssetsForAuditRun(auditRunId).catch(() => [] as OutreachAsset[]),
  ]);

  if (!data) notFound();

  const { auditRun, domain, findings, topPriorities, scores, categoryReviews } = data;
  const assetMap = Object.fromEntries(
    enrichmentAssets.map((a) => [a.type, a.content])
  ) as Partial<Record<OutreachAsset["type"], string>>;
  const inspectedCleanCount = categoryReviews.filter(
    (review) => review.reviewState === "inspected_clean"
  ).length;
  const lightlyInspectedCount = categoryReviews.filter(
    (review) => review.reviewState === "lightly_inspected"
  ).length;
  const insufficientEvidenceCount = categoryReviews.filter(
    (review) => review.reviewState === "insufficient_evidence"
  ).length;

  return (
    <main style={{ maxWidth: 800, margin: "48px auto", padding: "0 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 4 }}>
          {domain}
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          Run: {auditRunId} · Status: {auditRun.status}
          {auditRun.completedAt
            ? ` · Completed: ${new Date(auditRun.completedAt).toLocaleString()}`
            : ""}
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <Link
            href={`/report/${auditRunId}/full`}
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#1d4ed8",
              textDecoration: "none",
            }}
          >
            Read full report
          </Link>
        </div>

        {auditRun.homepageOnly && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              borderRadius: 6,
              color: "#92400e",
              fontSize: "0.875rem",
            }}
          >
            <strong>Homepage-only audit.</strong> Findings and scores reflect
            the homepage snapshot only. Whole-site claims are not supported in
            this report.
          </div>
        )}
      </div>

      <div
        style={{
          marginBottom: 32,
          padding: 24,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: "3rem",
            fontWeight: 700,
            color: scoreColor(scores.overall),
            lineHeight: 1,
            minWidth: 72,
            textAlign: "center",
          }}
        >
          {scores.overall}
        </div>
        <div>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Overall score</p>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            {findings.length} finding{findings.length !== 1 ? "s" : ""} across the
            current deterministic review. {inspectedCleanCount} categor
            {inspectedCleanCount !== 1 ? "ies" : "y"} inspected clean,{" "}
            {lightlyInspectedCount} lightly inspected, {insufficientEvidenceCount} with
            insufficient evidence.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {[
          {
            label: "Inspected Clean",
            value: inspectedCleanCount,
            background: "#f0fdf4",
            border: "#86efac",
            text: "#166534",
          },
          {
            label: "Light Inspection",
            value: lightlyInspectedCount,
            background: "#fffbeb",
            border: "#fcd34d",
            text: "#92400e",
          },
          {
            label: "Insufficient Evidence",
            value: insufficientEvidenceCount,
            background: "#f8fafc",
            border: "#cbd5e1",
            text: "#475569",
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${item.border}`,
              background: item.background,
            }}
          >
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: item.text }}>
              {item.value}
            </div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: item.text }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {topPriorities.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}
          >
            Top priorities
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: 12 }}>
            Curated shortlist of the strongest, most distinct issues surfaced in the
            captured audit evidence.
          </p>
          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {topPriorities.map((finding, index) => (
              <div
                key={`${finding.id}-priority`}
                style={{
                  padding: 16,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#6b7280",
                    }}
                  >
                    #{index + 1}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "#eff6ff",
                      color: "#1d4ed8",
                    }}
                  >
                    {CATEGORY_LABELS[finding.category]}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: SEVERITY_COLORS[finding.severity] + "1a",
                      color: SEVERITY_COLORS[finding.severity],
                    }}
                  >
                    {finding.severity.toUpperCase()}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background:
                        EVIDENCE_COLORS[finding.evidenceLevel] + "1a",
                      color: EVIDENCE_COLORS[finding.evidenceLevel],
                    }}
                  >
                    {finding.evidenceLevel} · {finding.confidence}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {stripHomepageScopePrefix(finding.title)}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    marginBottom: 8,
                  }}
                >
                  Support: {getFindingSupportLabel(finding)}
                </p>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "#4b5563",
                    marginBottom: 8,
                  }}
                >
                  {stripHomepageScopePrefix(finding.description)}
                </p>
                <p style={{ fontSize: "0.875rem", color: "#065f46" }}>
                  <strong>Recommendation:</strong> {stripHomepageScopePrefix(finding.recommendation)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <h2
          style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}
        >
          Category scores
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {categoryReviews.map((review) => {
            const isInspected = review.score !== null;
            const inspectionLabel =
              review.reviewState === "insufficient_evidence"
                ? "Insufficient evidence"
                : review.reviewState === "lightly_inspected"
                  ? review.findingCount === 0
                    ? "Light inspection"
                    : `${review.findingCount} finding${review.findingCount !== 1 ? "s" : ""} · light inspection`
                  : review.findingCount === 0
                    ? "Inspected clean"
                    : `${review.findingCount} finding${review.findingCount !== 1 ? "s" : ""}`;
            return (
              <div
                key={review.category}
                style={{
                  padding: "14px 16px",
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  opacity: isInspected ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "1.25rem",
                    color: isInspected ? scoreColor(review.score ?? 0) : "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  {isInspected ? review.score : "—"}
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 2,
                  }}
                >
                  {CATEGORY_LABELS[review.category]}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                  {inspectionLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(assetMap.summary || assetMap.quick_wins || assetMap.email || assetMap.collaboration || assetMap.loom_script) && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>
            AI Enrichment
          </h2>
          <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: 16 }}>
            Generated from deterministic findings. No facts added beyond stored evidence.
          </p>

          {assetMap.summary && (
            <div style={{ marginBottom: 16, padding: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6 }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: 8 }}>Executive Summary</h3>
              <p style={{ fontSize: "0.875rem", color: "#4b5563" }}>{assetMap.summary}</p>
            </div>
          )}

          {assetMap.quick_wins && (
            <div style={{ marginBottom: 16, padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6 }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#166534", marginBottom: 8 }}>Quick Wins</h3>
              <p style={{ fontSize: "0.875rem", color: "#166534", whiteSpace: "pre-wrap" }}>{assetMap.quick_wins}</p>
            </div>
          )}

          {(assetMap.email || assetMap.collaboration || assetMap.loom_script) && (
            <div style={{ padding: 16, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 6 }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#713f12", marginBottom: 12 }}>Outreach Assets</h3>
              {assetMap.email && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#92400e", marginBottom: 4 }}>Cold Email Draft</p>
                  <p style={{ fontSize: "0.875rem", color: "#713f12", whiteSpace: "pre-wrap" }}>{assetMap.email}</p>
                </div>
              )}
              {assetMap.collaboration && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#92400e", marginBottom: 4 }}>Collaboration Angle</p>
                  <p style={{ fontSize: "0.875rem", color: "#713f12" }}>{assetMap.collaboration}</p>
                </div>
              )}
              {assetMap.loom_script && (
                <div>
                  <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#92400e", marginBottom: 4 }}>Loom Script Notes</p>
                  <p style={{ fontSize: "0.875rem", color: "#713f12", whiteSpace: "pre-wrap" }}>{assetMap.loom_script}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <h2
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          Category review
        </h2>
        {findings.length === 0 && (
          <p style={{ color: "#6b7280", marginBottom: 16 }}>
            No prioritized findings were generated, but the category coverage states
            below still show what was inspected versus what had limited evidence.
          </p>
        )}
        {categoryReviews.map((review) => {
          const reviewStyle = REVIEW_STATE_STYLES[review.reviewState];
          return (
            <div key={review.category} style={{ marginBottom: 24 }}>
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 12,
                    paddingBottom: 6,
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  {CATEGORY_LABELS[review.category]}
                </h3>
                <div
                  style={{
                    marginBottom: 12,
                    padding: 14,
                    borderRadius: 6,
                    border: `1px solid ${reviewStyle.border}`,
                    background: reviewStyle.background,
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: reviewStyle.text,
                      marginBottom: 4,
                    }}
                  >
                    {review.headline}
                    {review.score !== null ? ` · ${review.score}/100` : ""}
                  </p>
                  <p style={{ fontSize: "0.875rem", color: reviewStyle.text }}>
                    {review.summary}
                  </p>
                </div>
                {review.findings.map((finding) => (
                  <div
                    key={finding.id}
                    style={{
                      marginBottom: 12,
                      padding: 16,
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        marginBottom: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: SEVERITY_COLORS[finding.severity] + "1a",
                          color: SEVERITY_COLORS[finding.severity],
                          whiteSpace: "nowrap",
                        }}
                      >
                        {finding.severity.toUpperCase()}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background:
                            EVIDENCE_COLORS[finding.evidenceLevel] + "1a",
                          color: EVIDENCE_COLORS[finding.evidenceLevel],
                          whiteSpace: "nowrap",
                        }}
                      >
                        {finding.evidenceLevel}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "#f3f4f6",
                          color: "#4b5563",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {finding.confidence} confidence
                      </span>
                      <span
                        style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}
                      >
                        {stripHomepageScopePrefix(finding.title)}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "#6b7280",
                        marginBottom: 8,
                      }}
                    >
                      Support: {getFindingSupportLabel(finding)}
                    </p>
                    <p
                      style={{
                        color: "#4b5563",
                        fontSize: "0.875rem",
                        marginBottom: 8,
                      }}
                    >
                      {stripHomepageScopePrefix(finding.description)}
                    </p>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#065f46",
                        background: "#ecfdf5",
                        padding: "8px 12px",
                        borderRadius: 4,
                      }}
                    >
                      <strong>Recommendation:</strong> {stripHomepageScopePrefix(finding.recommendation)}
                    </p>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
