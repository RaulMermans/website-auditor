import Link from "next/link";
import { listRecentAuditRuns } from "@/db/report";
import { getAuditFailurePresentation } from "@/lib/audit-failure";
import { AUDIT_STATUS_META } from "@/lib/report-presentation";
import type { AuditRunListItem } from "@/db/report";
import type { AuditStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AuditRunsLoadResult {
  runs: AuditRunListItem[];
  errorMessage: string | null;
}

function getPostgresErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

async function loadRecentAuditRuns(): Promise<AuditRunsLoadResult> {
  try {
    return {
      runs: await listRecentAuditRuns(50),
      errorMessage: null,
    };
  } catch (error) {
    const code = getPostgresErrorCode(error);
    const schemaError = code === "42703" || code === "42P01";

    console.error("[audits] failed to list audit runs", {
      code,
      hint:
        "Verify Vercel DATABASE_URL points at the production Postgres database, then run DATABASE_URL=... npm run migrate:up.",
      error,
    });

    return {
      runs: [],
      errorMessage: schemaError
        ? "Audit runs could not load because the configured database schema is missing expected tables or columns. Verify DATABASE_URL points at the intended production database, then run the production migrations."
        : "Audit runs could not load. Check Vercel function logs for [audits] failed to list audit runs.",
    };
  }
}

function formatDate(date: Date | null) {
  if (!date) return "—";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: AuditStatus }) {
  const meta = AUDIT_STATUS_META[status];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${meta.border}`,
        background: meta.background,
        color: meta.text,
        fontSize: "0.76rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

function renderActionLinks(run: AuditRunListItem) {
  if (run.status === "complete") {
    return (
      <>
        <Link href={`/report/${run.auditRunId}`} style={primaryLinkStyle}>
          Open concise report
        </Link>
        <Link href={`/report/${run.auditRunId}/full`} style={secondaryLinkStyle}>
          Open full report
        </Link>
      </>
    );
  }

  if (run.status === "failed") {
    return (
      <>
        <Link href={`/report/${run.auditRunId}`} style={primaryLinkStyle}>
          Open run
        </Link>
        <Link href="/intake" style={secondaryLinkStyle}>
          Start another audit
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href={`/report/${run.auditRunId}`} style={primaryLinkStyle}>
        Open run
      </Link>
      <Link href="/intake" style={secondaryLinkStyle}>
        Queue another audit
      </Link>
    </>
  );
}

function AuditRunCard({ run }: { run: AuditRunListItem }) {
  const statusMeta = AUDIT_STATUS_META[run.status];
  const failurePresentation = getAuditFailurePresentation(run);

  return (
    <article
      style={{
        padding: 20,
        borderRadius: 18,
        border: "1px solid #e5e7eb",
        background: "#fff",
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#9ca3af",
            }}
          >
            Audit Run
          </p>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 700 }}>{run.domain}</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.82rem" }}>
            {run.auditRunId}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {run.homepageOnly && (
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
              Homepage-only
            </span>
          )}
          <StatusBadge status={run.status} />
        </div>
      </div>

      <p
        style={{
          margin: "0 0 16px",
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${statusMeta.border}`,
          background: statusMeta.background,
          color: statusMeta.text,
          fontSize: "0.9rem",
        }}
      >
        {run.status === "failed" && failurePresentation
          ? failurePresentation.explanation
          : statusMeta.description}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={metaCardStyle}>
          <p style={metaLabelStyle}>Created</p>
          <p style={metaValueStyle}>{formatDate(run.createdAt)}</p>
        </div>
        <div style={metaCardStyle}>
          <p style={metaLabelStyle}>Completed</p>
          <p style={metaValueStyle}>{formatDate(run.completedAt)}</p>
        </div>
        <div style={metaCardStyle}>
          <p style={metaLabelStyle}>Recommended next step</p>
          <p style={metaValueStyle}>
            {run.status === "complete"
              ? "Review the concise report first, then open the full report."
              : run.status === "failed"
                ? failurePresentation?.retryGuidance ??
                  "Open the run details and inspect the failure status before retrying."
                : "Open the run to monitor progress and refresh when the status advances."}
          </p>
        </div>
      </div>

      {run.status === "failed" && failurePresentation && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          <p style={{ margin: "0 0 4px", fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase" }}>
            {failurePresentation.stageLabel}
          </p>
          <p style={{ margin: "0 0 4px", fontSize: "0.9rem", fontWeight: 700 }}>
            {failurePresentation.label}
          </p>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>{failurePresentation.explanation}</p>
          {failurePresentation.retryGuidance && (
            <p style={{ margin: "8px 0 0", fontSize: "0.84rem", color: "#7f1d1d" }}>
              {failurePresentation.retryGuidance}
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{renderActionLinks(run)}</div>
    </article>
  );
}

const metaCardStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const metaLabelStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#94a3b8",
};

const metaValueStyle: React.CSSProperties = {
  margin: 0,
  color: "#334155",
  fontSize: "0.9rem",
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
  fontWeight: 700,
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
  fontWeight: 700,
  textDecoration: "none",
};

export default async function AuditsPage() {
  const { runs, errorMessage } = await loadRecentAuditRuns();
  const readyCount = runs.filter((run) => run.status === "complete").length;
  const inProgressCount = runs.filter((run) =>
    ["pending", "discovering", "capturing", "analyzing"].includes(run.status)
  ).length;
  const failedCount = runs.filter((run) => run.status === "failed").length;
  const homepageOnlyCount = runs.filter((run) => run.homepageOnly).length;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 180px, #ffffff 180px)",
        padding: "40px 24px 72px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <section
          style={{
            marginBottom: 24,
            padding: "26px 28px",
            borderRadius: 24,
            background: "rgba(255,255,255,0.92)",
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
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#6366f1",
                }}
              >
                SiteSignal Internal
              </p>
              <h1 style={{ margin: "0 0 8px", fontSize: "2rem", fontWeight: 800 }}>Audit Runs</h1>
              <p style={{ margin: 0, color: "#475569", maxWidth: 720, fontSize: "0.96rem" }}>
                Each row is an evidence-backed brand and conversion diagnostic. Open the concise report for a prioritized finding set or the full report for the complete strategic readout.
              </p>
            </div>

            <Link href="/intake" style={primaryLinkStyle}>
              Run audit
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            {[
              ["Reports ready", readyCount, "#166534", "#f0fdf4", "#86efac"],
              ["In progress", inProgressCount, "#1d4ed8", "#eff6ff", "#bfdbfe"],
              ["Failed runs", failedCount, "#991b1b", "#fef2f2", "#fecaca"],
              ["Homepage-only", homepageOnlyCount, "#92400e", "#fffbeb", "#fcd34d"],
            ].map(([label, value, text, background, border]) => (
              <div
                key={label as string}
                style={{
                  padding: "16px 18px",
                  borderRadius: 16,
                  background: background as string,
                  border: `1px solid ${border as string}`,
                }}
              >
                <div style={{ fontSize: "1.7rem", fontWeight: 800, color: text as string }}>
                  {value}
                </div>
                <div style={{ fontSize: "0.84rem", fontWeight: 700, color: text as string }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {errorMessage ? (
          <section
            style={{
              padding: 32,
              background: "#fff",
              border: "1px solid #fecaca",
              borderRadius: 18,
              color: "#991b1b",
            }}
          >
            <h2 style={{ margin: "0 0 8px", color: "#7f1d1d", fontSize: "1.1rem" }}>
              Audit runs unavailable
            </h2>
            <p style={{ margin: 0 }}>{errorMessage}</p>
          </section>
        ) : runs.length === 0 ? (
          <section
            style={{
              padding: 32,
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 18,
              color: "#64748b",
              textAlign: "center",
            }}
          >
            No audit runs yet.{" "}
            <Link href="/intake" style={{ color: "#1d4ed8", fontWeight: 700 }}>
              Create the first one.
            </Link>
          </section>
        ) : (
          <section style={{ display: "grid", gap: 16 }}>
            {runs.map((run) => (
              <AuditRunCard key={run.auditRunId} run={run} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
