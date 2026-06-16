import { Check, X, TriangleAlert } from "lucide-react"
import { formatDateTime } from "../../utils/format"

// Lifecycle steps in order. `waiting` is shown when the step is the current
// (in-progress) stage.
const STEPS = [
  { key: "submitted",    label: "Submitted",            tsField: "submitted_at" },
  { key: "verified",     label: "Verified by Barangay", tsField: "verified_at",     waiting: "Awaiting barangay verification..." },
  { key: "acknowledged", label: "Acknowledged by MTPB", tsField: "acknowledged_at", waiting: "Awaiting MTPB acknowledgement..." },
  { key: "dispatched",   label: "Officer Dispatched",   tsField: "dispatched_at",   waiting: "Awaiting officer dispatch..." },
  { key: "resolved",     label: "Resolved",             tsField: "resolved_at",     waiting: "Awaiting resolution..." },
]

function Dot({ variant }) {
  const map = {
    done:    { bg: "var(--c-success)", border: "var(--c-success)", icon: <Check size={13} strokeWidth={3} color="#fff" /> },
    current: { bg: "var(--c-primary)", border: "var(--c-primary)", icon: null },
    future:  { bg: "transparent",      border: "var(--c-border)",  icon: null },
    danger:  { bg: "var(--c-danger)",  border: "var(--c-danger)",  icon: <X size={13} strokeWidth={3} color="#fff" /> },
    warn:    { bg: "var(--c-warning)", border: "var(--c-warning)", icon: <TriangleAlert size={12} color="#fff" /> },
  }
  const s = map[variant]
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: s.bg,
        border: `2px solid ${s.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        zIndex: 1,
      }}
    >
      {s.icon}
    </div>
  )
}

function Row({ variant, label, sub, last }) {
  const color = variant === "done"
    ? "var(--c-success)"
    : variant === "current"
      ? "var(--c-primary)"
      : variant === "danger"
        ? "var(--c-danger)"
        : variant === "warn"
          ? "var(--c-warning)"
          : "var(--c-muted)"
  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Dot variant={variant} />
        {!last && <div style={{ flex: 1, width: 2, background: "var(--c-border)", minHeight: 24 }} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 16 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 2 }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function StatusTimeline({ report }) {
  const { status } = report
  const rows = []

  // Rejected: timeline stops after Submitted.
  if (status === "rejected") {
    rows.push({ variant: "done", label: "Submitted", sub: formatDateTime(report.submitted_at) })
    rows.push({ variant: "danger", label: "Rejected", sub: formatDateTime(report.verified_at) })
  } else {
    // First step with no timestamp is the current (in-progress) stage.
    const firstPending = STEPS.findIndex((s) => !report[s.tsField])

    STEPS.forEach((step, idx) => {
      const ts = report[step.tsField]
      let variant
      if (ts) variant = "done"
      else if (idx === firstPending) variant = "current"
      else variant = "future"

      const sub = ts
        ? formatDateTime(ts)
        : variant === "current"
          ? step.waiting
          : null
      rows.push({ variant, label: step.label, sub })

      // Escalation branch sits between Acknowledged and Dispatched.
      if (step.key === "acknowledged" && (report.is_escalated || report.escalated_at || status === "escalated")) {
        rows.push({
          variant: "warn",
          label: "Escalated to supervisor",
          sub: formatDateTime(report.escalated_at),
        })
      }
    })
  }

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", marginBottom: 12 }}>
        Status Timeline
      </p>
      <div>
        {rows.map((r, i) => (
          <Row key={i} {...r} last={i === rows.length - 1} />
        ))}
      </div>

      {status === "rejected" && report.rejection_reason && (
        <div style={{ marginTop: 12, background: "var(--c-danger-lt)", borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 13, color: "var(--c-danger)", fontWeight: 500 }}>{report.rejection_reason}</p>
        </div>
      )}

      {status === "resolved" && (
        <div style={{ marginTop: 12, background: "var(--c-success-lt)", borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 13, color: "var(--c-success)", fontWeight: 600 }}>
            ✓ {report.resolution_outcome || "Resolved"}
          </p>
          {report.ticket_reference && (
            <p className="mono" style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 4 }}>
              Reference: {report.ticket_reference}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
