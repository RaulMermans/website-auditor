"use client";

export function PrintButton({ style }: { style?: React.CSSProperties }) {
  return (
    <button type="button" onClick={() => window.print()} style={style}>
      Download PDF
    </button>
  );
}
