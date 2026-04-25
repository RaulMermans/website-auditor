export function PrintButton({
  auditRunId,
  style,
}: {
  auditRunId: string;
  style?: React.CSSProperties;
}) {
  return (
    <a
      href={`/api/reports/${auditRunId}/pdf`}
      download
      style={{ textDecoration: "none", ...style }}
    >
      Download PDF
    </a>
  );
}
