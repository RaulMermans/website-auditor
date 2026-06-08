"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled render error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: "#fff",
          border: "1px solid #fecaca",
          borderRadius: 16,
          padding: 28,
          textAlign: "center",
          boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#dc2626",
          }}
        >
          Something went wrong
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>
          This page hit an unexpected error
        </h1>
        <p style={{ margin: "0 0 20px", color: "#475569", fontSize: "0.92rem" }}>
          The error has been logged. You can retry this page or head back to the audit command
          center.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: 0,
              background: "#0f172a",
              color: "#fff",
              fontSize: "0.86rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <Link
            href="/intake"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#334155",
              fontSize: "0.86rem",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Back to command center
          </Link>
        </div>
      </div>
    </main>
  );
}
