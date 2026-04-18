import { submitDomainAction } from "@/app/intake/actions";

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

  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 8 }}>
        Domain intake
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Submit a single domain. This shot persists the canonical domain, creates an audit
        run, and enqueues work for the worker boundary.
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

        <button
          type="submit"
          style={{
            width: "fit-content",
            padding: "12px 18px",
            border: 0,
            borderRadius: 6,
            background: "#111827",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Create audit job
        </button>
      </form>

      {success ? (
        <div
          style={{
            marginTop: 24,
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            padding: 20,
            color: "#065f46",
          }}
        >
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Audit job created.</p>
          <p>Canonical domain: {domain}</p>
          <p>Audit run id: {auditRunId}</p>
          <p>Status: {status}</p>
        </div>
      ) : null}

      {error ? (
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
