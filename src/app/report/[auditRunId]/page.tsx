import Link from "next/link";
import { notFound } from "next/navigation";
import { enrichmentRepository } from "@/db/enrichment";
import { prospectIntelligenceRepository, type ProspectIntelligenceRecord } from "@/db/prospect-intelligence";
import { reportRepository, type ReportCaptureFidelity } from "@/db/report";
import { getAuditFailurePresentation } from "@/lib/audit-failure";
import type { OutreachAsset } from "@/lib/types";
import type { ProspectAuditAgentResult } from "@/server/agents/prospect-audit-agent";
import {
  CATEGORY_LABELS,
  EVIDENCE_COLORS,
  getReportBadge,
  REVIEW_STATE_META,
  REPORT_READY_STATUSES,
  scoreColor,
  SEVERITY_COLORS,
  shouldDisplayLimitationNote,
} from "@/lib/report-presentation";
import {
  buildFullReportData,
  type FullReportFinding,
  type FullReportFindingGroup,
} from "@/server/audits/build-full-report";
import { PrintButton } from "@/app/report/print-button";

interface BadgePresentation {
  label: string;
  background: string;
  border: string;
  text: string;
}

function renderSummaryList(items: string[]) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
      {items.map((item) => (
        <li key={item} style={{ marginBottom: 8 }}>
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
        gap: 12,
        padding: "10px 12px",
        borderRadius: 12,
        background: "#fff",
        border: "1px solid #e2e8f0",
      }}
    >
      <span style={{ color: "#334155", fontWeight: 600 }}>{label}</span>
      <span style={{ color, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

const CAPTURE_FIDELITY_LABELS = {
  rendered_browser: "Rendered Browser",
  static_public: "Static Public",
  secondary_static: "Secondary Static",
  manual_evidence: "Manual Evidence",
  blocked_no_evidence: "Blocked / No Evidence",
} as const;

function getCaptureLimitations(fidelity?: ReportCaptureFidelity) {
  if (!fidelity) return ["Capture fidelity metadata was unavailable for this run."];
  if (fidelity.primaryFidelity === "rendered_browser") {
    return ["Browser-rendered HTML and screenshot-backed evidence were available for at least one accepted page."];
  }
  if (fidelity.primaryFidelity === "secondary_static") {
    return [
      "Homepage browser/static capture was blocked or unusable.",
      "Findings are bounded to accessible secondary public pages and static technical evidence.",
      "Visual, mobile layout, above-the-fold, and rendered interaction claims are excluded.",
    ];
  }
  if (fidelity.primaryFidelity === "static_public") {
    return [
      "The audit used public HTML/static evidence only.",
      "Visual, mobile layout, above-the-fold, and rendered interaction claims are excluded.",
    ];
  }
  if (fidelity.primaryFidelity === "blocked_no_evidence") {
    return ["No usable public evidence was captured. Findings should not be generated."];
  }
  return ["Manual evidence must stay explicitly labeled and scoped to the supplied artifacts."];
}

function StatusBadge({ label, background, border, text }: BadgePresentation) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background,
        border: `1px solid ${border}`,
        color: text,
        fontSize: "0.76rem",
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function FindingCard({ finding }: { finding: FullReportFinding }) {
  return (
    <article
      key={finding.id}
      style={{
        padding: 18,
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
        }}
      >
        <span
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            background: "#eff6ff",
            color: "#1d4ed8",
            fontSize: "0.74rem",
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
            fontSize: "0.74rem",
            fontWeight: 700,
          }}
        >
          {finding.severity.toUpperCase()}
        </span>
        <span
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            color: "#475569",
            fontSize: "0.74rem",
            fontWeight: 700,
          }}
        >
          {finding.claimLabel}
        </span>
        <span
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            background: `${EVIDENCE_COLORS[finding.evidenceLevel]}1a`,
            color: EVIDENCE_COLORS[finding.evidenceLevel],
            fontSize: "0.74rem",
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
            fontSize: "0.74rem",
            fontWeight: 700,
          }}
        >
          {finding.supportLabel}
        </span>
      </div>

      <h3 style={{ margin: "0 0 14px", fontSize: "1.08rem", lineHeight: 1.35 }}>{finding.title}</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={findingSectionStyle}>
          <p style={findingSectionLabelStyle}>What we found</p>
          <p style={findingSectionValueStyle}>{finding.summary}</p>
        </div>
        <div style={findingSectionStyle}>
          <p style={findingSectionLabelStyle}>Why it matters</p>
          <p style={findingSectionValueStyle}>{finding.whyItMatters}</p>
        </div>
        <div style={findingSectionStyle}>
          <p style={findingSectionLabelStyle}>Risk if unchanged</p>
          <p style={findingSectionValueStyle}>{finding.risk}</p>
        </div>
        <div
          style={{
            ...findingSectionStyle,
            background: "#ecfdf5",
            border: "1px solid #bbf7d0",
          }}
        >
          <p style={{ ...findingSectionLabelStyle, color: "#166534" }}>Next step</p>
          <p style={{ ...findingSectionValueStyle, color: "#166534" }}>{finding.nextStep}</p>
        </div>
      </div>

      <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>
        Evidence framing: {finding.evidenceNote}
      </p>
    </article>
  );
}

function FindingGroupSection({ group }: { group: FullReportFindingGroup }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          padding: "14px 16px",
          borderRadius: 16,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
        }}
      >
        <p style={{ margin: "0 0 6px", fontWeight: 800, color: "#0f172a" }}>{group.label}</p>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55 }}>{group.description}</p>
      </div>
      {group.findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </div>
  );
}

function RunStatusView({
  auditRunId,
  domain,
  status,
  statusMeta,
  homepageOnly,
  limitationNote,
  failurePresentation,
}: {
  auditRunId: string;
  domain: string;
  status: import("@/lib/types").AuditStatus;
  statusMeta: BadgePresentation & { description: string };
  homepageOnly: boolean;
  limitationNote?: string | null;
  failurePresentation: ReturnType<typeof getAuditFailurePresentation>;
}) {
  const showLimitationNote = shouldDisplayLimitationNote(status, limitationNote);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 220px, #ffffff 220px)",
        padding: "40px 24px 72px",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 24 }}>
        <section
          style={{
            padding: "28px 30px",
            borderRadius: 24,
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            boxShadow: "0 20px 50px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            <div>
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#6366f1",
                }}
              >
                Audit Run Status
              </p>
              <h1 style={{ margin: "0 0 8px", fontSize: "2.25rem", fontWeight: 800 }}>{domain}</h1>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.92rem" }}>Run: {auditRunId}</p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/audits" style={secondaryLinkStyle}>
                Back to audits
              </Link>
              <Link href="/intake" style={primaryLinkStyle}>
                Start another audit
              </Link>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
            <StatusBadge {...statusMeta} />
            {homepageOnly && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  color: "#92400e",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                }}
              >
                Homepage-only scope
              </span>
            )}
          </div>

          <div style={summaryPanelStyle}>
            <p style={panelEyebrowStyle}>Current Status</p>
            <p style={{ margin: "0 0 10px", color: "#334155", lineHeight: 1.6 }}>
              {failurePresentation?.explanation ?? statusMeta.description}
            </p>
            <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
              Deterministic findings and report narrative stay hidden until the run completes with
              enough trustworthy evidence.
            </p>
          </div>

          {showLimitationNote && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 16px",
                borderRadius: 12,
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                color: "#92400e",
                fontSize: "0.88rem",
                lineHeight: 1.6,
              }}
            >
              <strong>Capture limitation:</strong> {limitationNote}
            </div>
          )}
        </section>

        {failurePresentation && (
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <p style={sectionEyebrowStyle}>{failurePresentation.stageLabel}</p>
                <h2 style={sectionTitleStyle}>{failurePresentation.label}</h2>
                <p style={sectionIntroStyle}>{failurePresentation.explanation}</p>
              </div>
            </div>
            {failurePresentation.retryGuidance && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 16,
                  background: "#fefce8",
                  border: "1px solid #fde68a",
                  color: "#92400e",
                  lineHeight: 1.6,
                }}
              >
                {failurePresentation.retryGuidance}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

const findingSectionStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const findingSectionLabelStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: "0.74rem",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#64748b",
};

const findingSectionValueStyle: React.CSSProperties = {
  margin: 0,
  color: "#334155",
  fontSize: "0.93rem",
  lineHeight: 1.55,
};

const REACH_OUT_COLORS: Record<"yes" | "maybe" | "no", { bg: string; border: string; text: string }> = {
  yes: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
  maybe: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
  no: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#16a34a",
};

function ProspectIntelligenceBlock({
  record,
  result,
}: {
  record: ProspectIntelligenceRecord;
  result: ProspectAuditAgentResult;
}) {
  const reachOut = result.reachOutRecommendation;
  const reachOutColors = REACH_OUT_COLORS[reachOut.decision];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Decision block — topmost, answers "should I reach out?" */}
      <div
        style={{
          padding: "18px 20px",
          borderRadius: 18,
          background: reachOutColors.bg,
          border: `1px solid ${reachOutColors.border}`,
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: "0.76rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: reachOutColors.text }}>
          Reach-out Recommendation
        </p>
        <p style={{ margin: "0 0 10px", fontSize: "1.6rem", fontWeight: 800, color: reachOutColors.text }}>
          {reachOut.decision.toUpperCase()} · {reachOut.confidence} confidence
        </p>
        <p style={{ margin: "0 0 14px", color: reachOutColors.text, lineHeight: 1.6 }}>
          {reachOut.rationale}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "0.74rem", fontWeight: 800, color: reachOutColors.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Best Pitch
            </p>
            <p style={{ margin: 0, color: reachOutColors.text, fontWeight: 700, lineHeight: 1.5 }}>
              {result.recommendedService.name}
            </p>
            <p style={{ margin: "4px 0 0", color: reachOutColors.text, fontSize: "0.86rem", lineHeight: 1.5 }}>
              {result.recommendedService.rationale}
            </p>
          </div>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "0.74rem", fontWeight: 800, color: reachOutColors.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              First Outreach Hook
            </p>
            <p style={{ margin: 0, color: reachOutColors.text, lineHeight: 1.5, fontSize: "0.9rem" }}>
              {result.outreachAngle.openingInsight}
            </p>
          </div>
        </div>
      </div>

      {/* Scores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div style={summaryPanelStyle}>
          <p style={panelEyebrowStyle}>Prospect Fit Score</p>
          <p style={{ margin: 0, color: scoreColor(record.prospectFitScore), fontSize: "2rem", fontWeight: 800 }}>
            {record.prospectFitScore}/100
          </p>
        </div>
        <div style={summaryPanelStyle}>
          <p style={panelEyebrowStyle}>Commercial Opportunity</p>
          <p style={{ margin: 0, color: scoreColor(record.commercialOpportunityScore), fontSize: "2rem", fontWeight: 800 }}>
            {record.commercialOpportunityScore}/100
          </p>
        </div>
        <div style={summaryPanelStyle}>
          <p style={panelEyebrowStyle}>Capture Fidelity</p>
          <p style={{ margin: 0, color: "#0f172a", fontWeight: 800 }}>
            {CAPTURE_FIDELITY_LABELS[record.captureFidelity]}
          </p>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "0.86rem", lineHeight: 1.5 }}>
            {result.captureFidelityAssessment.summary}
          </p>
          {result.captureFidelityAssessment.limitations.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: "#64748b", fontSize: "0.84rem" }}>
              {result.captureFidelityAssessment.limitations.map((lim) => (
                <li key={lim} style={{ marginBottom: 4 }}>{lim}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Primary gap */}
      <div style={summaryPanelStyle}>
        <p style={panelEyebrowStyle}>Primary Gap</p>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>{result.primaryGap}</p>
      </div>

      {/* Opportunity cards */}
      <div>
        <p style={{ margin: "0 0 10px", fontSize: "0.76rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
          Top Opportunities
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {result.topOpportunities.map((opp, idx) => (
            <div
              key={idx}
              style={{
                padding: "14px 16px",
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <span style={{ padding: "3px 8px", borderRadius: 999, background: `${PRIORITY_COLORS[opp.priority] ?? "#64748b"}1a`, color: PRIORITY_COLORS[opp.priority] ?? "#64748b", fontSize: "0.72rem", fontWeight: 800 }}>
                  {opp.priority.toUpperCase()}
                </span>
                <span style={{ padding: "3px 8px", borderRadius: 999, background: `${EVIDENCE_COLORS[opp.evidenceLabel]}1a`, color: EVIDENCE_COLORS[opp.evidenceLabel], fontSize: "0.72rem", fontWeight: 800 }}>
                  {opp.evidenceLabel}
                </span>
                <span style={{ padding: "3px 8px", borderRadius: 999, background: "#f1f5f9", color: "#475569", fontSize: "0.72rem", fontWeight: 700 }}>
                  {opp.confidence} confidence
                </span>
              </div>
              <p style={{ margin: "0 0 8px", fontWeight: 800, color: "#0f172a" }}>{opp.title}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                <div>
                  <p style={findingSectionLabelStyle}>Evidence</p>
                  <p style={findingSectionValueStyle}>{opp.evidence}</p>
                </div>
                <div>
                  <p style={findingSectionLabelStyle}>Business Impact</p>
                  <p style={findingSectionValueStyle}>{opp.businessImpact}</p>
                </div>
                <div>
                  <p style={findingSectionLabelStyle}>Recommended Action</p>
                  <p style={findingSectionValueStyle}>{opp.recommendedAction}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Missing evidence */}
      {result.missingEvidence.length > 0 && (
        <div style={summaryPanelStyle}>
          <p style={panelEyebrowStyle}>Missing Evidence</p>
          {renderSummaryList(result.missingEvidence)}
        </div>
      )}

      {/* Internal notes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {result.internalNotes.whyNow && (
          <div style={summaryPanelStyle}>
            <p style={panelEyebrowStyle}>Why Now</p>
            <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>{result.internalNotes.whyNow}</p>
          </div>
        )}
        {result.internalNotes.suggestedNextStep && (
          <div style={summaryPanelStyle}>
            <p style={panelEyebrowStyle}>Suggested Next Step</p>
            <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>{result.internalNotes.suggestedNextStep}</p>
          </div>
        )}
      </div>

      {/* Outreach draft */}
      {(result.outreachAngle.subjectLine || result.outreachAngle.messageDraft) && (
        <div
          style={{
            padding: 18,
            borderRadius: 18,
            background: "#fefce8",
            border: "1px solid #fde68a",
          }}
        >
          <p style={{ ...panelEyebrowStyle, color: "#92400e" }}>Outreach Draft</p>
          {result.outreachAngle.subjectLine && (
            <div style={{ marginBottom: 10 }}>
              <p style={outreachLabelStyle}>Subject</p>
              <p style={{ margin: 0, color: "#78350f", fontWeight: 700 }}>{result.outreachAngle.subjectLine}</p>
            </div>
          )}
          {result.outreachAngle.messageDraft && (
            <div>
              <p style={outreachLabelStyle}>Message</p>
              <p style={{ ...outreachCopyStyle, whiteSpace: "pre-wrap" }}>{result.outreachAngle.messageDraft}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ auditRunId: string }>;
}) {
  const { auditRunId } = await params;
  const [data, enrichmentAssets, prospectIntelligence] = await Promise.all([
    reportRepository.getReportData(auditRunId),
    enrichmentRepository.getAssetsForAuditRun(auditRunId).catch(() => [] as OutreachAsset[]),
    prospectIntelligenceRepository.getForAuditRun(auditRunId).catch(() => null),
  ]);

  if (!data) {
    notFound();
  }

  const statusMeta = getReportBadge(
    data.auditRun.status,
    data.captureFidelity?.primaryFidelity
  );
  const failurePresentation = getAuditFailurePresentation(data.auditRun);

  if (!REPORT_READY_STATUSES.includes(data.auditRun.status)) {
    return (
      <RunStatusView
        auditRunId={auditRunId}
        domain={data.domain}
        status={data.auditRun.status}
        statusMeta={statusMeta}
        homepageOnly={data.auditRun.homepageOnly}
        limitationNote={data.auditRun.limitationNote}
        failurePresentation={failurePresentation}
      />
    );
  }

  const fullReport = buildFullReportData(data);
  const assetMap = Object.fromEntries(
    enrichmentAssets.map((asset) => [asset.type, asset.content])
  ) as Partial<Record<OutreachAsset["type"], string>>;
  const hasEnrichment =
    Boolean(assetMap.summary) ||
    Boolean(assetMap.quick_wins) ||
    Boolean(assetMap.email) ||
    Boolean(assetMap.collaboration) ||
    Boolean(assetMap.loom_script);
  const captureFidelity = data.captureFidelity;
  const scoredCategories = fullReport.categorySections
    .filter((section) => section.score !== null)
    .map((section) => section.label);
  const excludedCategories = fullReport.categorySections
    .filter((section) => section.score === null)
    .map((section) => section.label);
  const showLimitationNote = shouldDisplayLimitationNote(
    data.auditRun.status,
    data.auditRun.limitationNote
  );
  const reviewStateCounts = data.categoryReviews.reduce<
    Record<keyof typeof REVIEW_STATE_META, number>
  >(
    (acc, review) => {
      acc[review.reviewState] += 1;
      return acc;
    },
    {
      inspected_clean: 0,
      inspected_with_findings: 0,
      limited_coverage: 0,
      lightly_inspected: 0,
      insufficient_evidence: 0,
    }
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 220px, #ffffff 220px)",
        padding: "40px 24px 72px",
      }}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 2cm 1.5cm; size: A4; }
          body { font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gap: 24 }}>
        <section
          id="overview"
          style={{
            padding: "28px 30px",
            borderRadius: 24,
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            boxShadow: "0 20px 50px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            <div>
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#6366f1",
                }}
              >
                Concise Audit Report
              </p>
              <h1 style={{ margin: "0 0 8px", fontSize: "2.25rem", fontWeight: 800 }}>
                {fullReport.domain}
              </h1>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.92rem" }}>
                Run: {auditRunId}
              </p>
            </div>

            <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/audits" style={secondaryLinkStyle}>
                Back to audits
              </Link>
              <Link href={`/report/${auditRunId}/full`} style={secondaryLinkStyle}>
                Full report
              </Link>
              <PrintButton
                auditRunId={auditRunId}
                style={{
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 14px",
                  borderRadius: 999,
                  background: "#0f172a",
                  color: "#fff",
                  border: "1px solid #0f172a",
                  fontSize: "0.84rem",
                  fontWeight: 800,
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 18,
            }}
          >
            <StatusBadge {...statusMeta} />
            {data.auditRun.homepageOnly && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  color: "#92400e",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                }}
              >
                Homepage-only scope
              </span>
            )}
          </div>

          {/* Coverage & Limitations callout */}
          <div
            style={{
              marginBottom: showLimitationNote ? 10 : 18,
              padding: "14px 16px",
              borderRadius: 14,
              background: "#fef9c3",
              border: "1px solid #fde047",
              color: "#713f12",
              fontSize: "0.88rem",
              lineHeight: 1.6,
            }}
          >
            <strong>Coverage note:</strong>{" "}
            This report reflects deterministic signals from the captured page set only.
            Categories with insufficient evidence are treated as unknown, not clean.
            Scores apply only to inspected categories.{" "}
            <Link
              href={`/report/${auditRunId}/full#appendix`}
              className="no-print"
              style={{ color: "#92400e", fontWeight: 700 }}
            >
              See full evidence notes →
            </Link>
          </div>

          {showLimitationNote && (
            <div
              style={{
                marginBottom: 18,
                padding: "12px 16px",
                borderRadius: 14,
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                color: "#92400e",
                fontSize: "0.88rem",
                lineHeight: 1.6,
              }}
            >
              <strong>Capture limitation:</strong> {data.auditRun.limitationNote}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                padding: 20,
                borderRadius: 18,
                background: "#0f172a",
                color: "#fff",
              }}
            >
              <div style={{ fontSize: "3.1rem", fontWeight: 800, lineHeight: 1, color: "#fff" }}>
                {fullReport.scoreSummary.overall}
              </div>
              <p style={{ margin: "10px 0 8px", fontSize: "0.84rem", fontWeight: 700, opacity: 0.85 }}>
                Overall score
              </p>
              <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.9rem", lineHeight: 1.55 }}>
                {fullReport.executiveSummary.inspectionFrame}
              </p>
            </div>

            <div
              style={{
                padding: 20,
                borderRadius: 18,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <p style={panelEyebrowStyle}>Main Conclusion</p>
              <p style={{ margin: "0 0 10px", color: "#0f172a", fontSize: "1rem", lineHeight: 1.65 }}>
                {fullReport.executiveSummary.overview}
              </p>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem", lineHeight: 1.55 }}>
                {fullReport.appendix.scopeNote}
              </p>
            </div>

            <div
              style={{
                padding: 20,
                borderRadius: 18,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <p style={panelEyebrowStyle}>Do First</p>
              {renderSummaryList(fullReport.nextActions.quickWins.slice(0, 3))}
            </div>
          </div>

          <nav
            className="no-print"
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {[
              ["#overview", "Overview"],
              ["#priorities", "Top Priorities"],
              ["#scores", "Score Summary"],
              ["#capture", "Capture Fidelity"],
              ...(prospectIntelligence ? [["#prospect", "Prospect Intelligence"]] : []),
              ["#review", "Category Review"],
              ["#evidence", "Evidence Notes"],
              ...(hasEnrichment ? [["#ai", "AI Enrichment"]] : []),
            ].map(([href, label]) => (
              <a key={href} href={href} style={anchorPillStyle}>
                {label}
              </a>
            ))}
          </nav>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {(Object.entries(REVIEW_STATE_META) as Array<
            [keyof typeof REVIEW_STATE_META, (typeof REVIEW_STATE_META)[keyof typeof REVIEW_STATE_META]]
          >).map(([key, meta]) => (
            <div
              key={key}
              style={{
                padding: "16px 18px",
                borderRadius: 18,
                border: `1px solid ${meta.border}`,
                background: meta.background,
              }}
            >
              <div style={{ fontSize: "1.8rem", fontWeight: 800, color: meta.text }}>
                {reviewStateCounts[key]}
              </div>
              <p style={{ margin: "4px 0 6px", fontSize: "0.84rem", fontWeight: 800, color: meta.text }}>
                {meta.label}
              </p>
              <p style={{ margin: 0, color: meta.text, fontSize: "0.86rem", lineHeight: 1.5 }}>
                {meta.description}
              </p>
            </div>
          ))}
        </section>

        <section id="priorities" style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Priority View</p>
              <h2 style={sectionTitleStyle}>Top Priorities</h2>
              <p style={sectionIntroStyle}>
                This shortlist is intended to answer two questions quickly: what is most likely
                reducing credibility or performance, and what should be fixed before deeper polish.
              </p>
            </div>
          </div>

          {fullReport.topPriorities.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>
              No prioritized issues were surfaced in the current deterministic findings set.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {fullReport.topPriorityGroups.map((group) => (
                <FindingGroupSection key={group.posture} group={group} />
              ))}
            </div>
          )}
        </section>

        <section id="scores" style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Coverage And Scoring</p>
              <h2 style={sectionTitleStyle}>Score Summary</h2>
              <p style={sectionIntroStyle}>
                Scores only reflect categories with enough deterministic evidence to score honestly.
                Use the status label on each category before interpreting the number.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
              gap: 16,
            }}
          >
            <div
              style={{
                padding: 18,
                borderRadius: 18,
                background: "#fff",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                {fullReport.categorySections.map((section) => {
                  const reviewMeta = REVIEW_STATE_META[section.reviewState];

                  return (
                    <a
                      key={section.category}
                      href={`#category-${section.category}`}
                      style={{
                        padding: "14px 16px",
                        borderRadius: 14,
                        background: reviewMeta.background,
                        border: `1px solid ${reviewMeta.border}`,
                        textDecoration: "none",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "1.55rem",
                          fontWeight: 800,
                          color: section.score === null ? reviewMeta.text : scoreColor(section.score),
                          lineHeight: 1,
                          marginBottom: 8,
                        }}
                      >
                        {section.score ?? "—"}
                      </div>
                      <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
                        {CATEGORY_LABELS[section.category]}
                      </div>
                      <div style={{ color: reviewMeta.text, fontSize: "0.82rem", fontWeight: 700 }}>
                        {section.inspectionLabel}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={summaryPanelStyle}>
                <p style={panelEyebrowStyle}>What Is Working</p>
                {renderSummaryList(fullReport.executiveSummary.whatIsWorking)}
              </div>
              <div style={summaryPanelStyle}>
                <p style={panelEyebrowStyle}>What Is Limiting</p>
                {renderSummaryList(fullReport.executiveSummary.whatIsLimiting)}
              </div>
            </div>
          </div>
        </section>

        <section id="capture" style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Evidence Coverage</p>
              <h2 style={sectionTitleStyle}>Capture Fidelity</h2>
              <p style={sectionIntroStyle}>
                Scoring is constrained by what the deterministic workflow actually captured.
                Excluded categories are unknown, not clean.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <div style={summaryPanelStyle}>
              <p style={panelEyebrowStyle}>Capture Fidelity</p>
              <p style={{ margin: 0, color: "#0f172a", fontSize: "1.35rem", fontWeight: 800 }}>
                {captureFidelity
                  ? CAPTURE_FIDELITY_LABELS[captureFidelity.primaryFidelity]
                  : "Unknown"}
              </p>
              {captureFidelity && (
                <p style={{ margin: "10px 0 0", color: "#64748b", lineHeight: 1.55 }}>
                  {captureFidelity.acceptedPageCount} accepted page(s), {captureFidelity.browserPageCount} browser,
                  {" "}{captureFidelity.staticPageCount + captureFidelity.fallbackStaticPageCount} static,
                  {" "}{captureFidelity.secondaryStaticPageCount} secondary static,
                  {" "}{captureFidelity.screenshotPageCount} screenshot-backed.
                </p>
              )}
            </div>
            <div style={summaryPanelStyle}>
              <p style={panelEyebrowStyle}>Limitations</p>
              {renderSummaryList(getCaptureLimitations(captureFidelity))}
            </div>
            <div style={summaryPanelStyle}>
              <p style={panelEyebrowStyle}>Scored Categories</p>
              {renderSummaryList(scoredCategories.length > 0 ? scoredCategories : ["None"])}
            </div>
            <div style={summaryPanelStyle}>
              <p style={panelEyebrowStyle}>Excluded Categories</p>
              {renderSummaryList(excludedCategories.length > 0 ? excludedCategories : ["None"])}
            </div>
          </div>
        </section>

        <section id="review" style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Detailed Review</p>
              <h2 style={sectionTitleStyle}>Category Review</h2>
              <p style={sectionIntroStyle}>
                Each category below separates what was found from why it matters, the downside of
                leaving it unchanged, and the most direct next move.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {fullReport.categorySections.map((section) => {
              const reviewMeta = REVIEW_STATE_META[section.reviewState];

              return (
                <section
                  key={section.category}
                  id={`category-${section.category}`}
                  style={{
                    scrollMarginTop: 24,
                    padding: 20,
                    borderRadius: 20,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 14,
                      flexWrap: "wrap",
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <h3 style={{ margin: "0 0 8px", fontSize: "1.18rem", fontWeight: 800 }}>
                        {section.label}
                      </h3>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <StatusBadge {...reviewMeta} />
                        <span
                          style={{
                            color: section.score === null ? "#94a3b8" : scoreColor(section.score),
                            fontWeight: 800,
                          }}
                        >
                          {section.score === null ? "No score" : `${section.score}/100`}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        maxWidth: 360,
                        padding: "10px 12px",
                        borderRadius: 14,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        color: "#475569",
                        fontSize: "0.84rem",
                        fontWeight: 700,
                      }}
                    >
                      {section.inspectionNote}
                    </div>
                  </div>

                  <p style={{ margin: "0 0 14px", color: "#334155", lineHeight: 1.6 }}>
                    {section.interpretation}
                  </p>

                  {section.recommendations.length > 0 && (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: "14px 16px",
                        borderRadius: 16,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <p style={{ margin: "0 0 8px", fontWeight: 800, color: "#0f172a" }}>
                        Recommended moves
                      </p>
                      {renderSummaryList(section.recommendations)}
                    </div>
                  )}

                  {section.findings.length > 0 ? (
                    <div style={{ display: "grid", gap: 14 }}>
                      {section.findingGroups.map((group) => (
                        <FindingGroupSection key={group.posture} group={group} />
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: "#64748b" }}>
                      No prioritized findings are listed for this category beyond the inspection
                      note above.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </section>

        <section id="evidence" style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={sectionEyebrowStyle}>Evidence And Scope</p>
              <h2 style={sectionTitleStyle}>Evidence Notes</h2>
              <p style={sectionIntroStyle}>
                This section is meant to make the report’s confidence boundaries explicit before
                any narrative interpretation is taken too far.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            <div style={summaryPanelStyle}>
              <p style={panelEyebrowStyle}>Scope</p>
              <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>{fullReport.appendix.scopeNote}</p>
            </div>
            <div style={summaryPanelStyle}>
              <p style={panelEyebrowStyle}>Evidence Levels</p>
              <div style={{ display: "grid", gap: 8 }}>
                {renderCountRow("Measured", fullReport.appendix.evidenceCounts.Measured, EVIDENCE_COLORS.Measured)}
                {renderCountRow("Observed", fullReport.appendix.evidenceCounts.Observed, EVIDENCE_COLORS.Observed)}
                {renderCountRow("Inferred", fullReport.appendix.evidenceCounts.Inferred, EVIDENCE_COLORS.Inferred)}
              </div>
            </div>
            <div style={summaryPanelStyle}>
              <p style={panelEyebrowStyle}>Inspection Notes</p>
              {renderSummaryList(fullReport.appendix.inspectionNotes)}
            </div>
            {fullReport.appendix.excludedPageNotes.length > 0 && (
              <div
                style={{
                  ...summaryPanelStyle,
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                }}
              >
                <p style={{ ...panelEyebrowStyle, color: "#92400e" }}>Excluded Pages</p>
                {renderSummaryList(fullReport.appendix.excludedPageNotes)}
              </div>
            )}
          </div>
        </section>

        {prospectIntelligence && (
          <section id="prospect" style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <p style={sectionEyebrowStyle}>Internal Prospecting</p>
                <h2 style={sectionTitleStyle}>Prospect Intelligence</h2>
                <p style={sectionIntroStyle}>
                  Internal prospecting intelligence generated from accepted audit evidence.
                  {!prospectIntelligence.result && " (Legacy record — re-run enrichment for full structured output.)"}
                </p>
              </div>
            </div>

            {prospectIntelligence.result ? (
              <ProspectIntelligenceBlock
                record={prospectIntelligence}
                result={prospectIntelligence.result}
              />
            ) : (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  color: "#92400e",
                  fontSize: "0.88rem",
                }}
              >
                Prospect Intelligence data could not be parsed. Re-run enrichment to generate structured output.
              </div>
            )}
          </section>
        )}

        {hasEnrichment && (
          <section id="ai" style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <p style={sectionEyebrowStyle}>Optional Downstream Layer</p>
                <h2 style={sectionTitleStyle}>AI Enrichment</h2>
                <p style={sectionIntroStyle}>
                  These assets are generated from the stored deterministic findings only. They are
                  summaries and outreach helpers, not new evidence.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {assetMap.summary && (
                <div style={summaryPanelStyle}>
                  <p style={panelEyebrowStyle}>Executive Summary</p>
                  <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>{assetMap.summary}</p>
                </div>
              )}

              {assetMap.quick_wins && (
                <div
                  style={{
                    ...summaryPanelStyle,
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                  }}
                >
                  <p style={{ ...panelEyebrowStyle, color: "#166534" }}>Quick Wins</p>
                  <p style={{ margin: 0, color: "#166534", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {assetMap.quick_wins}
                  </p>
                </div>
              )}

              {(assetMap.email || assetMap.collaboration || assetMap.loom_script) && (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 18,
                    background: "#fefce8",
                    border: "1px solid #fde68a",
                  }}
                >
                  <p style={{ ...panelEyebrowStyle, color: "#92400e" }}>Outreach Assets</p>
                  <div style={{ display: "grid", gap: 12 }}>
                    {assetMap.email && (
                      <div>
                        <p style={outreachLabelStyle}>Cold Email Draft</p>
                        <p style={outreachCopyStyle}>{assetMap.email}</p>
                      </div>
                    )}
                    {assetMap.collaboration && (
                      <div>
                        <p style={outreachLabelStyle}>Collaboration Angle</p>
                        <p style={outreachCopyStyle}>{assetMap.collaboration}</p>
                      </div>
                    )}
                    {assetMap.loom_script && (
                      <div>
                        <p style={outreachLabelStyle}>Loom Script Notes</p>
                        <p style={{ ...outreachCopyStyle, whiteSpace: "pre-wrap" }}>{assetMap.loom_script}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: "22px 24px",
  borderRadius: 24,
  background: "#fff",
  border: "1px solid #e5e7eb",
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.04)",
};

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: 16,
};

const sectionEyebrowStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: "0.76rem",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#6366f1",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "1.45rem",
  fontWeight: 800,
  color: "#0f172a",
};

const sectionIntroStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: "0.94rem",
  lineHeight: 1.6,
  maxWidth: 760,
};

const panelEyebrowStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "0.76rem",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#64748b",
};

const summaryPanelStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: "#fff",
  border: "1px solid #e5e7eb",
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 999,
  background: "#0f172a",
  color: "#fff",
  fontSize: "0.84rem",
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 999,
  background: "#fff",
  color: "#334155",
  border: "1px solid #cbd5e1",
  fontSize: "0.84rem",
  fontWeight: 800,
  textDecoration: "none",
};

const anchorPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#334155",
  fontSize: "0.82rem",
  fontWeight: 700,
  textDecoration: "none",
};

const outreachLabelStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: "0.76rem",
  fontWeight: 800,
  color: "#92400e",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const outreachCopyStyle: React.CSSProperties = {
  margin: 0,
  color: "#78350f",
  lineHeight: 1.6,
};
