import { AuditProgressCard } from "@/components/audit-progress-card";

interface Props {
  auditRunId: string;
  domain: string;
  initialStatus?: string;
}

export function IntakeSuccessTrigger({ auditRunId, domain, initialStatus }: Props) {
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: 8,
          padding: "14px 18px",
          color: "#065f46",
          marginBottom: 8,
        }}
      >
        <p style={{ fontWeight: 700, margin: "0 0 4px" }}>Audit job created and queued.</p>
        <p style={{ margin: 0, fontSize: "0.88rem" }}>
          Domain: <strong>{domain}</strong> — Run ID: {auditRunId}
        </p>
      </div>
      <AuditProgressCard auditRunId={auditRunId} initialStatus={initialStatus} />
    </div>
  );
}
