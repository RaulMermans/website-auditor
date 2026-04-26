"use client";

import { useEffect, useState } from "react";

type TriggerState = "idle" | "triggering" | "started" | "error";

interface Props {
  auditRunId: string;
  domain: string;
  initialStatus?: string;
}

export function IntakeSuccessTrigger({ auditRunId, domain, initialStatus }: Props) {
  const [triggerState, setTriggerState] = useState<TriggerState>("idle");

  useEffect(() => {
    setTriggerState("triggering");

    fetch("/api/worker/trigger", { method: "POST" })
      .then((res) => {
        if (res.ok) {
          setTriggerState("started");
        } else {
          setTriggerState("error");
          console.error("[intake] worker trigger returned non-ok status", res.status);
        }
      })
      .catch((err) => {
        setTriggerState("error");
        console.error("[intake] worker trigger failed", err);
      });
  }, []);

  return (
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
      <p style={{ fontWeight: 700, marginBottom: 8 }}>Audit job created and queued.</p>
      <p>Canonical domain: {domain}</p>
      <p>Audit run id: {auditRunId}</p>
      {initialStatus ? <p>Initial status: {initialStatus}</p> : null}
      {triggerState === "triggering" && (
        <p style={{ marginTop: 8, color: "#6b7280" }}>Starting audit processing…</p>
      )}
      {triggerState === "started" && (
        <p style={{ marginTop: 8 }}>
          Audit processing started.{" "}
          <a href={`/report/${auditRunId}`} style={{ fontWeight: 600, textDecoration: "underline" }}>
            View report
          </a>
        </p>
      )}
      {triggerState === "error" && (
        <p style={{ marginTop: 8, color: "#b45309" }}>
          Audit was queued but the processing trigger failed.{" "}
          <a href={`/report/${auditRunId}`} style={{ fontWeight: 600, textDecoration: "underline" }}>
            Check report status
          </a>
        </p>
      )}
    </div>
  );
}
