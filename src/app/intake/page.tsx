import Link from "next/link";
import { submitDomainAction } from "@/app/intake/actions";
import { IntakeSuccessTrigger } from "@/components/intake-success-trigger";
import { SubmitButton } from "@/components/submit-button";
import { listRecentAuditRuns, type AuditRunListItem } from "@/db/report";
import { AUDIT_STATUS_META, REPORT_READY_STATUSES } from "@/lib/report-presentation";

// Allow up to 5 minutes for the server-side after() worker trigger to run.
export const maxDuration = 300;

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getValue(params: SearchParams, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

async function resolveSearchParams(searchParams?: Promise<SearchParams>) {
  return Promise.resolve(searchParams ?? {});
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

function RecentAuditRow({ run }: { run: AuditRunListItem }) {
  const meta = AUDIT_STATUS_META[run.status];
  const isReady = REPORT_READY_STATUSES.includes(run.status);
  const actionLabel = isReady ? "View report" : "View status";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontWeight: 700,
            fontSize: "0.9rem",
            color: "#0f172a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {run.domain}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#94a3b8" }}>
          {formatDate(run.createdAt)}
        </p>
      </div>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 8px",
          borderRadius: 999,
          border: `1px solid ${meta.border}`,
          background: meta.background,
          color: meta.text,
          fontSize: "0.7rem",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {meta.label}
      </span>
      <Link
        href={`/report/${run.auditRunId}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "6px 12px",
          borderRadius: 999,
          background: "#0f172a",
          color: "#fff",
          fontSize: "0.76rem",
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {actionLabel}
      </Link>
    </div>
  );
}

export default async function IntakePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = await resolveSearchParams(searchParams);
  const domain = getValue(params, "domain") ?? "";
  const status = getValue(params, "status");
  const auditRunId = getValue(params, "auditRunId");
  const success = getValue(params, "success") === "1";
  const error = getValue(params, "error");
  const showError = Boolean(error) && !success;

  let recentRuns: AuditRunListItem[] = [];
  try {
    recentRuns = await listRecentAuditRuns(10);
  } catch {
    // Recent audits panel is informational — silent fallback keeps intake usable.
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 160px, #ffffff 160px)",
        padding: "40px 24px 72px",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/* Page header */}
        <section
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 32,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#6366f1",
              }}
            >
              SiteSignal Internal
            </p>
            <h1 style={{ margin: "0 0 8px", fontSize: "2rem", fontWeight: 800, color: "#0f172a" }}>
              Brand audit command center
            </h1>
            <p style={{ margin: 0, color: "#475569", maxWidth: 560, fontSize: "0.96rem" }}>
              Submit a public domain to capture up to five priority pages and produce
              deterministic, evidence-backed findings on brand clarity, conversion path, trust
              signals, and experience flow.
            </p>
          </div>

          <nav style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <Link
              href="/audits"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "9px 16px",
                borderRadius: 999,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                fontSize: "0.84rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              View all audits
            </Link>
            <Link
              href="/internal-logout"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "9px 16px",
                borderRadius: 999,
                background: "#0f172a",
                color: "#fff",
                fontSize: "0.84rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Logout
            </Link>
          </nav>
        </section>

        {/* Two-column body */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 460px) 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Left: audit form */}
          <section>
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 28,
                boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)",
              }}
            >
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                }}
              >
                New audit
              </p>
              <h2
                style={{
                  margin: "0 0 20px",
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                Run a brand audit
              </h2>

              <form action={submitDomainAction} style={{ display: "grid", gap: 16 }}>
                <label
                  htmlFor="domain"
                  style={{
                    display: "grid",
                    gap: 8,
                    fontWeight: 600,
                    color: "#0f172a",
                    fontSize: "0.9rem",
                  }}
                >
                  Domain
                  <input
                    id="domain"
                    name="domain"
                    type="text"
                    defaultValue={domain}
                    placeholder="example.com"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      fontSize: "1rem",
                      color: "#0f172a",
                      background: "#fff",
                    }}
                  />
                </label>

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <SubmitButton label="Start audit" pendingLabel="Starting…" />
              </form>
            </div>

            {showError ? (
              <div
                style={{
                  marginTop: 16,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 12,
                  padding: 20,
                  color: "#991b1b",
                }}
              >
                <p style={{ fontWeight: 700, marginBottom: 8, margin: "0 0 8px" }}>
                  Unable to create audit job.
                </p>
                <p style={{ margin: 0 }}>{error}</p>
                {auditRunId ? (
                  <p style={{ margin: "6px 0 0" }}>Audit run id: {auditRunId}</p>
                ) : null}
                {status ? <p style={{ margin: "6px 0 0" }}>Status: {status}</p> : null}
              </div>
            ) : null}

            {success && auditRunId ? (
              <IntakeSuccessTrigger
                auditRunId={auditRunId}
                domain={domain}
                initialStatus={status}
              />
            ) : null}
          </section>

          {/* Right: recent audits */}
          <section aria-label="Recent audits">
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div
                style={{
                  padding: "18px 20px 14px",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: "0 0 2px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#94a3b8",
                    }}
                  >
                    Recent audits
                  </p>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    Latest runs
                  </h2>
                </div>
                <Link
                  href="/audits"
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#6366f1",
                    textDecoration: "none",
                  }}
                >
                  View all →
                </Link>
              </div>

              {recentRuns.length === 0 ? (
                <div
                  style={{
                    padding: "32px 20px",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                  }}
                >
                  No audits yet. Submit a domain above to get started.
                </div>
              ) : (
                <div>
                  {recentRuns.map((run) => (
                    <RecentAuditRow key={run.auditRunId} run={run} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
