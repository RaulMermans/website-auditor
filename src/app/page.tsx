import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 8 }}>
        Website Audit Agent
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Evidence-backed website audits. Rule-first, LLM-second.
      </p>
      <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
        <Link href="/intake" style={{ color: "#111827", fontWeight: 600 }}>
          Create audit job
        </Link>
        <Link href="/audits" style={{ color: "#111827", fontWeight: 600 }}>
          View all audits
        </Link>
      </div>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 24,
          color: "#374151",
        }}
      >
        <strong>Status:</strong> Scaffold complete. Audit pipeline not yet implemented.
      </div>
    </main>
  );
}
