import { loginAction } from "./actions";

export default async function InternalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <main style={{ maxWidth: 400, margin: "120px auto", padding: "0 24px" }}>
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
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 20 }}>
        SiteSignal Access
      </h1>
      <form action={loginAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="password"
          name="password"
          placeholder="Access password"
          required
          autoFocus
          style={{
            padding: "10px 14px",
            fontSize: "1rem",
            border: `1px solid ${hasError ? "#dc2626" : "#d1d5db"}`,
            borderRadius: 6,
            outline: "none",
          }}
        />
        {hasError && (
          <p style={{ margin: 0, color: "#dc2626", fontSize: "0.875rem" }}>
            Incorrect password. Try again.
          </p>
        )}
        <button
          type="submit"
          style={{
            padding: "10px 14px",
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: "1rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Access tool
        </button>
      </form>
    </main>
  );
}
