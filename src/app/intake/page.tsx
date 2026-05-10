import { submitDomainAction } from "@/app/intake/actions";
import { IntakeSuccessTrigger } from "@/components/intake-success-trigger";
import { SubmitButton } from "@/components/submit-button";

// Allow up to 5 minutes for the server-side after() worker trigger to run.
export const maxDuration = 300;

type SearchParams = Record<string, string | string[] | undefined>;

function getValue(params: SearchParams, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

async function resolveSearchParams(searchParams?: Promise<SearchParams>) {
  return Promise.resolve(searchParams ?? {});
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

  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
      <p
        style={{
          margin: "0 0 6px",
          fontSize: "0.72rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#6366f1",
        }}
      >
        SiteSignal Internal
      </p>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 8 }}>
        Run a brand audit
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Submit a public domain to start an evidence-backed audit of brand clarity, trust signals, conversion path, and experience flow. The pipeline captures up to five priority pages and produces deterministic findings before optional LLM enrichment.
      </p>

      <form
        action={submitDomainAction}
        style={{
          display: "grid",
          gap: 16,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 24,
        }}
      >
        <label htmlFor="domain" style={{ display: "grid", gap: 8, fontWeight: 600 }}>
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
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: "1rem",
            }}
          />
        </label>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <SubmitButton label="Start audit" pendingLabel="Starting…" />
      </form>

      {success && auditRunId ? (
        <IntakeSuccessTrigger auditRunId={auditRunId} domain={domain} initialStatus={status} />
      ) : null}

      {showError ? (
        <div
          style={{
            marginTop: 24,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: 20,
            color: "#991b1b",
          }}
        >
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Unable to create audit job.</p>
          <p>{error}</p>
          {auditRunId ? <p>Audit run id: {auditRunId}</p> : null}
          {status ? <p>Status: {status}</p> : null}
        </div>
      ) : null}
    </main>
  );
}
