import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, Camera } from "lucide-react"
import { citizen, citizenStore } from "../../services/api"
import LoadingSpinner from "../../components/LoadingSpinner"
import ReportCard from "../../components/citizen/ReportCard"

export default function CitizenHome() {
  const navigate = useNavigate()
  const alias = citizenStore.getAlias()
  const reportIds = citizenStore.getReportIds()

  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(reportIds.length > 0)

  useEffect(() => {
    if (reportIds.length === 0) return
    let active = true
    // Most recent three (ids are appended in submission order).
    const ids = [...reportIds].slice(-3).reverse()
    Promise.all(ids.map((id) => citizen.getReport(id, citizenStore.getToken(id)).catch(() => null)))
      .then((results) => {
        if (!active) return
        const found = results.filter(Boolean)
        found.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
        setRecent(found)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          height: 48,
          background: "var(--c-surface)",
          borderBottom: "1px solid var(--c-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--c-primary)" }}>ParkWatch</span>
        <button
          type="button"
          onClick={() => navigate("/citizen/reports")}
          aria-label="My reports"
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
        >
          <Bell size={20} color="var(--c-muted)" />
        </button>
      </header>

      <div style={{ padding: 16 }}>
        {/* Greeting */}
        <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 16 }}>
          {alias ? (
            <>
              <p style={{ fontSize: 13, color: "var(--c-muted)" }}>Welcome back,</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: "var(--c-text)" }}>{alias}</p>
              <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>
                Your identity is kept anonymous from enforcement officers.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 16, fontWeight: 600, color: "var(--c-text)" }}>
                Help keep Malate's streets clear.
              </p>
              <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 4 }}>
                Report illegal parking anonymously - no account needed.
              </p>
            </>
          )}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => navigate("/citizen/report")}
          style={{
            width: "100%",
            height: 56,
            marginTop: 16,
            background: "var(--c-primary)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 16,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <Camera size={20} />
          Report a Violation
        </button>

        {/* My Reports preview */}
        <section style={{ marginTop: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)" }}>
            My Reports
          </p>

          {reportIds.length === 0 ? (
            <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 16, marginTop: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--c-text)" }}>No reports submitted yet.</p>
              <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 4 }}>
                Your reports will appear here after your first submission.
              </p>
            </div>
          ) : loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <LoadingSpinner size={24} color="var(--c-primary)" />
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {recent.map((r) => (
                <ReportCard key={r.report_id} report={r} onClick={() => navigate(`/citizen/reports/${r.report_id}`)} />
              ))}
              <button
                type="button"
                onClick={() => navigate("/citizen/reports")}
                style={{ background: "none", border: "none", color: "var(--c-primary)", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: 0 }}
              >
                View all {reportIds.length} reports →
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
