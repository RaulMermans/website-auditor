import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
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
        Internal Tool
      </p>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 6 }}>
        SiteSignal Internal
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: "1.05rem" }}>
        AI Brand &amp; Conversion Auditor — evidence-backed audits for brand clarity, trust, UX flow, and conversion readiness.
      </p>
      <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
        <Link href="/intake" style={{ color: "#111827", fontWeight: 600 }}>
          Run an audit
        </Link>
        <Link href="/audits" style={{ color: "#111827", fontWeight: 600 }}>
          View audit runs
        </Link>
      </div>
      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 24,
          color: "#475569",
          fontSize: "0.9rem",
        }}
      >
        Submit a domain on the intake page to produce a rule-first, evidence-backed diagnostic. LLM enrichment is additive and optional.
      </div>
    </main>
  );
}
