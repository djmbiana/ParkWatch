import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BellOff } from "lucide-react"
import { citizen, citizenStore } from "../../services/api"
import CitizenHeader from "../../components/citizen/CitizenHeader"
import LoadingSpinner from "../../components/LoadingSpinner"
import StatusBadge from "../../components/StatusBadge"
import { formatDateTime } from "../../utils/format"

// Status → the citizen-facing alert line + the timestamp field that drives it.
const ALERT_FOR = {
  pending:      { msg: "Submitted — pending barangay verification.", ts: "submitted_at" },
  verified:     { msg: "Verified by the barangay.",                  ts: "verified_at" },
  acknowledged: { msg: "Acknowledged by MTPB.",                      ts: "acknowledged_at" },
  dispatched:   { msg: "An officer has been dispatched.",            ts: "dispatched_at" },
  escalated:    { msg: "Escalated to a supervisor.",                 ts: "escalated_at" },
  resolved:     { msg: "Resolved.",                                  ts: "resolved_at" },
  rejected:     { msg: "Rejected after review.",                     ts: "verified_at" },
}

export default function Alerts() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const ids = citizenStore.getReportIds()

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return }
    let active = true
    Promise.all(ids.map((id) => citizen.getReport(id, citizenStore.getToken(id)).catch(() => null)))
      .then((rows) => {
        if (!active) return
        const items = rows.filter(Boolean).map((r) => {
          const a = ALERT_FOR[r.status] ?? ALERT_FOR.pending
          return { report_id: r.report_id, status: r.status, msg: a.msg, at: r[a.ts] || r.submitted_at }
        })
        items.sort((x, y) => new Date(y.at) - new Date(x.at))
        setAlerts(items)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <CitizenHeader title="Alerts" />
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><LoadingSpinner size={24} color="var(--c-primary)" /></div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: 48, padding: 16 }}>
          <BellOff size={48} color="var(--c-muted)" strokeWidth={1.5} style={{ margin: "0 auto" }} />
          <p style={{ fontSize: 16, fontWeight: 500, color: "var(--c-text)", marginTop: 16 }}>No alerts yet.</p>
          <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 4 }}>Updates on your reports will appear here.</p>
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          {alerts.map((a) => (
            <div
              key={a.report_id}
              onClick={() => navigate(`/citizen/reports/${a.report_id}`)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 14, marginBottom: 10, cursor: "pointer" }}
            >
              <div>
                <p className="mono" style={{ fontSize: 12, color: "var(--c-muted)" }}>RPT-{a.report_id}</p>
                <p style={{ fontSize: 14, color: "var(--c-text)", marginTop: 2 }}>{a.msg}</p>
                <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 2 }}>{formatDateTime(a.at) ?? "—"}</p>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
