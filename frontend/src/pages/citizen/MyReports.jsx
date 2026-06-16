import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { RefreshCw, ClipboardX } from "lucide-react"
import { citizen, citizenStore } from "../../services/api"
import LoadingSpinner from "../../components/LoadingSpinner"
import ReportCard from "../../components/citizen/ReportCard"

const FILTERS = [
  { key: "all",      label: "All" },
  { key: "pending",  label: "Pending",  statuses: ["pending"] },
  { key: "verified", label: "Verified", statuses: ["verified", "acknowledged", "dispatched", "escalated"] },
  { key: "resolved", label: "Resolved", statuses: ["resolved"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
]

export default function MyReports() {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")

  const reportIds = citizenStore.getReportIds()

  const load = useCallback(() => {
    const ids = citizenStore.getReportIds()
    if (ids.length === 0) { setReports([]); setLoading(false); return }
    setLoading(true)
    Promise.all(ids.map((id) => citizen.getReport(id, citizenStore.getToken(id)).catch(() => null)))
      .then((results) => {
        const found = results.filter(Boolean)
        found.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
        setReports(found)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const visible = reports.filter((r) => {
    const f = FILTERS.find((x) => x.key === filter)
    return !f?.statuses || f.statuses.includes(r.status)
  })

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--c-text)" }}>My Reports</h1>
        <button
          type="button"
          onClick={load}
          aria-label="Refresh"
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
        >
          <RefreshCw size={20} color="var(--c-muted)" />
        </button>
      </header>

      {reportIds.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: 48, padding: 16 }}>
          <ClipboardX size={48} color="var(--c-muted)" strokeWidth={1.5} style={{ margin: "0 auto" }} />
          <p style={{ fontSize: 16, fontWeight: 500, color: "var(--c-text)", marginTop: 16 }}>
            You have not submitted any reports yet.
          </p>
          <button
            type="button"
            onClick={() => navigate("/citizen/report")}
            style={{
              marginTop: 16,
              background: "var(--c-primary)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              height: 48,
              padding: "0 20px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Submit a Report
          </button>
        </div>
      ) : (
        <div style={{ padding: "0 16px" }}>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 16, overflowX: "auto", marginBottom: 12 }}>
            {FILTERS.map((f) => {
              const active = filter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: `2px solid ${active ? "var(--c-primary)" : "transparent"}`,
                    color: active ? "var(--c-primary)" : "var(--c-muted)",
                    fontSize: 14,
                    fontWeight: 500,
                    padding: "8px 0",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
              <LoadingSpinner size={24} color="var(--c-primary)" />
            </div>
          ) : visible.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--c-muted)", fontSize: 14, padding: 24 }}>
              No reports in this category.
            </p>
          ) : (
            visible.map((r) => (
              <ReportCard key={r.report_id} report={r} onClick={() => navigate(`/citizen/reports/${r.report_id}`)} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
