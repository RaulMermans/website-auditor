import { notFound } from "next/navigation";
import { reportRepository } from "@/db/report";
import { enrichmentRepository } from "@/db/enrichment";
import type { Finding, FindingCategory, OutreachAsset } from "@/lib/types";
import { ALL_FINDING_CATEGORIES } from "@/server/scoring/score-audit";

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  performance: "Performance",
  technical_seo: "Technical SEO",
  accessibility: "Accessibility",
  ux_ui: "UX / UI",
  messaging_content: "Messaging & Content",
  conversion: "Conversion",
  trust_signals: "Trust Signals",
  mobile_experience: "Mobile Experience",
};

const SEVERITY_COLORS: Record<Finding["severity"], string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#65a30d",
  info: "#6b7280",
};

const EVIDENCE_COLORS: Record<Finding["evidenceLevel"], string> = {
  Measured: "#0284c7",
  Observed: "#7c3aed",
  Inferred: "#9ca3af",
};

function scoreColor(score: number) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#d97706";
  return "#dc2626";
}

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

  const { auditRun, domain, findings, scores } = data;
  const assetMap = Object.fromEntries(enrichmentAssets.map((a) => [a.type, a.content])) as Partial<Record<OutreachAsset["type"], string>>;

  const findingsByCategory = new Map<FindingCategory, Finding[]>();
  for (const finding of findings) {
    const list = findingsByCategory.get(finding.category) ?? [];
    list.push(finding);
    findingsByCategory.set(finding.category, list);
  }

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
            {findings.length} finding{findings.length !== 1 ? "s" : ""} across{" "}
            {findingsByCategory.size} categor
            {findingsByCategory.size !== 1 ? "ies" : "y"}. Score is
            deterministic: 100 minus severity penalties from stored findings.
          </p>
        </div>
      </div>

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
          {ALL_FINDING_CATEGORIES.map((cat) => {
            const score = scores.byCategory[cat];
            const count = findingsByCategory.get(cat)?.length ?? 0;
            const isInspected = !scores.inspectedCategories || scores.inspectedCategories.includes(cat);
            return (
              <div
                key={cat}
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
                    color: isInspected ? scoreColor(score) : "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  {isInspected ? score : "—"}
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 2,
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                  {!isInspected
                    ? "Not inspected"
                    : count === 0
                      ? "No findings"
                      : `${count} finding${count !== 1 ? "s" : ""}`}
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

      {findings.length === 0 ? (
        <p style={{ color: "#6b7280" }}>
          No findings generated for this audit run.
        </p>
      ) : (
        <div>
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Findings
          </h2>
          {ALL_FINDING_CATEGORIES.filter((cat) =>
            findingsByCategory.has(cat)
          ).map((cat) => {
            const catFindings = findingsByCategory.get(cat)!;
            return (
              <div key={cat} style={{ marginBottom: 24 }}>
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
                  {CATEGORY_LABELS[cat]}
                </h3>
                {catFindings.map((finding) => (
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
                        style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}
                      >
                        {finding.title}
                      </span>
                    </div>
                    <p
                      style={{
                        color: "#4b5563",
                        fontSize: "0.875rem",
                        marginBottom: 8,
                      }}
                    >
                      {finding.description}
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
                      <strong>Recommendation:</strong> {finding.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
