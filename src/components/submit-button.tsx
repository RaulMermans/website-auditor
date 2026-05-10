"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  label?: string;
  pendingLabel?: string;
  style?: React.CSSProperties;
}

export function SubmitButton({
  label = "Start audit",
  pendingLabel = "Starting…",
  style,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      style={{
        width: "fit-content",
        padding: "12px 18px",
        border: 0,
        borderRadius: 6,
        background: pending ? "#374151" : "#111827",
        color: "#fff",
        fontWeight: 600,
        cursor: pending ? "not-allowed" : "pointer",
        opacity: pending ? 0.75 : 1,
        display: "flex",
        alignItems: "center",
        gap: 8,
        transition: "background 0.15s, opacity 0.15s",
        ...style,
      }}
    >
      {pending && (
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.4)",
            borderTopColor: "#fff",
            animation: "spin 0.7s linear infinite",
          }}
        />
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}
