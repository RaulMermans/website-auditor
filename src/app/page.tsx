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
        Private internal tool — not a public product. No live demo is exposed.
      </p>
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/internal-login"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            background: "#6366f1",
            color: "#fff",
            borderRadius: 6,
            fontWeight: 600,
            textDecoration: "none",
            fontSize: "1rem",
          }}
        >
          Sign in
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
        Access to audit runs, reports, and intake requires an internal access password.
        The repository is public but the deployed app is access-gated.
      </div>
    </main>
  );
}
