import Link from "next/link";
import { listRecentAuditRuns } from "@/db/report";

export const dynamic = "force-dynamic";
import type { AuditRunListItem } from "@/db/report";
import type { AuditStatus } from "@/lib/types";

const STATUS_COLORS: Record<AuditStatus, { bg: string; color: string }> = {
  pending: { bg: "#f3f4f6", color: "#374151" },
  discovering: { bg: "#eff6ff", color: "#1d4ed8" },
  capturing: { bg: "#eff6ff", color: "#1d4ed8" },
  analyzing: { bg: "#eff6ff", color: "#1d4ed8" },
  complete: { bg: "#f0fdf4", color: "#166534" },
  failed: { bg: "#fef2f2", color: "#991b1b" },
};

function StatusBadge({ status }: { status: AuditStatus }) {
  const { bg, color } = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
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

function AuditRow({ run }: { run: AuditRunListItem }) {
  const isComplete = run.status === "complete";
  const isFailed = run.status === "failed";

  return (
    <tr>
      <td style={cellStyle}>
        <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#6b7280" }}>
          {run.auditRunId.slice(0, 8)}…
        </span>
      </td>
      <td style={cellStyle}>
        <span style={{ fontWeight: 600 }}>{run.domain}</span>
        {run.homepageOnly && (
          <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "#d97706" }}>homepage-only</span>
        )}
      </td>
      <td style={cellStyle}>
        <StatusBadge status={run.status} />
      </td>
      <td style={{ ...cellStyle, color: "#6b7280", fontSize: "0.8rem" }}>
        {formatDate(run.createdAt)}
      </td>
      <td style={{ ...cellStyle, color: "#6b7280", fontSize: "0.8rem" }}>
        {formatDate(run.completedAt)}
      </td>
      <td style={cellStyle}>
        {isFailed && run.failureReason ? (
          <span
            style={{
              fontSize: "0.75rem",
              color: "#991b1b",
              maxWidth: 260,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={run.failureReason}
          >
            {run.failureReason}
          </span>
        ) : isComplete ? (
          <Link
            href={`/report/${run.auditRunId}`}
            style={{ fontSize: "0.875rem", color: "#1d4ed8", fontWeight: 600 }}
          >
            View report →
          </Link>
        ) : (
          <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>—</span>
        )}
      </td>
    </tr>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "2px solid #e5e7eb",
  whiteSpace: "nowrap",
};

export default async function AuditsPage() {
  const runs = await listRecentAuditRuns(50);

  return (
    <main style={{ maxWidth: 1000, margin: "48px auto", padding: "0 24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Audit Runs</h1>
        <Link href="/intake" style={{ fontSize: "0.875rem", color: "#1d4ed8", fontWeight: 600 }}>
          + New audit
        </Link>
      </div>

      {runs.length === 0 ? (
        <div
          style={{
            padding: 32,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          No audit runs yet.{" "}
          <Link href="/intake" style={{ color: "#1d4ed8" }}>
            Create the first one.
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Domain</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Completed</th>
                <th style={thStyle}>Details</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <AuditRow key={run.auditRunId} run={run} />
              ))}
            </tbody>
          </table>
          <p style={{ padding: "10px 12px", fontSize: "0.75rem", color: "#9ca3af" }}>
            Showing {runs.length} most recent audit run{runs.length !== 1 ? "s" : ""}.
          </p>
        </div>
      )}
    </main>
  );
}
