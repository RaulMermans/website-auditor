"use client";

import { useEffect, useRef, useState } from "react";
import type { AuditStatusResponse } from "@/app/api/audits/[auditRunId]/status/route";

const POLL_INTERVAL_MS = 2500;

const TERMINAL_STATUSES = new Set(["complete", "partial_complete", "needs_human_review", "failed"]);

const STEPS = [
  "Creating audit run",
  "Discovering pages",
  "Capturing pages",
  "Extracting and reviewing evidence",
  "Scoring categories",
  "Report ready",
];

function stepIndex(stage: string): number {
  const i = STEPS.indexOf(stage);
  return i >= 0 ? i : 0;
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid #c7d2fe",
        borderTopColor: "#6366f1",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

export function AuditProgressCard({
  auditRunId,
  initialStatus,
}: {
  auditRunId: string;
  initialStatus?: string;
}) {
  const [data, setData] = useState<AuditStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTerminal = data ? TERMINAL_STATUSES.has(data.status) : false;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/audits/${auditRunId}/status`, { cache: "no-store" });
        if (!res.ok) {
          setError("Could not fetch audit status.");
          return;
        }
        const json: AuditStatusResponse = await res.json();
        if (!cancelled) {
          setData(json);
          if (!TERMINAL_STATUSES.has(json.status)) {
            timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      } catch {
        if (!cancelled) setError("Network error while checking audit status.");
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [auditRunId]);

  const currentStage = data?.currentStage ?? initialStatus ?? "Creating audit run";
  const currentStepIdx = stepIndex(currentStage);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          marginTop: 24,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 24,
          display: "grid",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isTerminal && <Spinner />}
          <p
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: "1rem",
              color: "#0f172a",
            }}
          >
            {data?.message ?? "Starting audit…"}
          </p>
        </div>

        {/* Step checklist */}
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: 8,
          }}
        >
          {STEPS.map((step, idx) => {
            const done = idx < currentStepIdx;
            const active = idx === currentStepIdx && !isTerminal;
            const color = done ? "#166534" : active ? "#1d4ed8" : "#94a3b8";

            return (
              <li
                key={step}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.88rem",
                  fontWeight: active || done ? 700 : 400,
                  color,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: done ? "#dcfce7" : active ? "#eff6ff" : "#f8fafc",
                    border: `1.5px solid ${done ? "#86efac" : active ? "#bfdbfe" : "#e2e8f0"}`,
                    fontSize: "0.65rem",
                    flexShrink: 0,
                  }}
                >
                  {done ? "✓" : idx + 1}
                </span>
                {step}
                {active && (
                  <span style={{ marginLeft: 4 }}>
                    <Spinner />
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {data?.pages && data.pages.total > 0 && (
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              fontSize: "0.82rem",
              color: "#475569",
            }}
          >
            <span>Pages: {data.pages.total}</span>
            <span style={{ color: "#166534" }}>Accepted: {data.pages.accepted}</span>
            {data.pages.needsReview > 0 && (
              <span style={{ color: "#92400e" }}>Needs review: {data.pages.needsReview}</span>
            )}
            {data.pages.failed > 0 && (
              <span style={{ color: "#991b1b" }}>Failed: {data.pages.failed}</span>
            )}
          </div>
        )}

        {error && (
          <p style={{ margin: 0, color: "#991b1b", fontSize: "0.84rem" }}>{error}</p>
        )}

        {data?.reportReady && (
          <a
            href={`/report/${auditRunId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 16px",
              borderRadius: 999,
              background: "#0f172a",
              color: "#fff",
              fontSize: "0.88rem",
              fontWeight: 700,
              textDecoration: "none",
              width: "fit-content",
            }}
          >
            View report →
          </a>
        )}

        {data?.status === "needs_human_review" && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "#fff7ed",
              border: "1px solid #fdba74",
              color: "#9a3412",
              fontSize: "0.84rem",
              lineHeight: 1.55,
            }}
          >
            Some pages could not be verified automatically. You can still{" "}
            <a href={`/report/${auditRunId}`} style={{ color: "#9a3412", fontWeight: 700 }}>
              view the available report
            </a>{" "}
            and review the findings manually.
          </div>
        )}

        {data?.status === "failed" && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "0.84rem",
              lineHeight: 1.55,
            }}
          >
            The audit run failed. Check the domain is publicly accessible and{" "}
            <a href="/intake" style={{ color: "#991b1b", fontWeight: 700 }}>
              try again
            </a>
            .
          </div>
        )}
      </div>
    </>
  );
}
