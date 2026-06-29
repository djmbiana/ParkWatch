import StatusBadge from "../StatusBadge"
import { formatDateTime } from "../../utils/format"

// Left accent color by status group.
function accentFor(status) {
  switch (status) {
    case "pending":      return "var(--c-warning)"
    case "verified":
    case "acknowledged":
    case "dispatched":   return "var(--c-primary)"
    case "resolved":     return "var(--c-success)"
    case "rejected":
    case "escalated":    return "var(--c-danger)"
    default:             return "var(--c-border)"
  }
}

export default function ReportCard({ report, onClick }) {
  const streetName = report.street?.street_name ?? report.street_name ?? "-"

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick?.() }}
      style={{
        position: "relative",
        background: "var(--c-surface)",
        border: "1px solid var(--c-border)",
        borderRadius: 12,
        padding: 16,
        paddingLeft: 20,
        marginBottom: 12,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          borderRadius: "2px 0 0 2px",
          background: accentFor(report.status),
        }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="mono" style={{ fontSize: 12, color: "var(--c-muted)" }}>
          RPT-{report.report_id}
        </span>
        <StatusBadge status={report.status} />
      </div>

      <p style={{ fontSize: 16, fontWeight: 600, color: "var(--c-text)", marginTop: 4 }}>
        {report.violation_type}
      </p>
      <p style={{ fontSize: 13, color: "var(--c-muted)" }}>{streetName}</p>
      <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 2 }}>
        {formatDateTime(report.submitted_at) ?? "-"}
      </p>
    </div>
  )
}
