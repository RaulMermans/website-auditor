interface Props {
  auditRunId: string;
  domain: string;
  initialStatus?: string;
}

export function IntakeSuccessTrigger({ auditRunId, domain, initialStatus }: Props) {
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
      <p style={{ marginTop: 12 }}>
        <a href={`/report/${auditRunId}`} style={{ fontWeight: 600, textDecoration: "underline" }}>
          View report
        </a>
      </p>
    </div>
  );
}
