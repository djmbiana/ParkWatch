import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ShieldCheck, Trash2 } from "lucide-react"
import { citizenStore } from "../../services/api"
import CitizenHeader from "../../components/citizen/CitizenHeader"

export default function Account() {
  const navigate = useNavigate()
  const alias = citizenStore.getAlias()
  const reportCount = citizenStore.getReportIds().length
  const [confirmClear, setConfirmClear] = useState(false)

  const clearData = () => {
    localStorage.removeItem("parkwatch_reports")
    localStorage.removeItem("parkwatch_alias")
    localStorage.removeItem("parkwatch_report_tokens")
    setConfirmClear(false)
    navigate("/citizen")
  }

  return (
    <div>
      <CitizenHeader title="Account" />
      <div style={{ padding: 16 }}>
        {/* Anonymous identity */}
        <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 16, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--c-primary-lt)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <ShieldCheck size={28} color="var(--c-primary)" />
          </div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", marginTop: 12 }}>Your Anonymous ID</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: "var(--c-text)", marginTop: 4 }}>{alias || "Not generated yet"}</p>
          <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 6 }}>
            {alias
              ? "Enforcement officers only ever see this ID - never your name or device."
              : "You'll get an anonymous ID after your first report."}
          </p>
        </div>

        {/* How it works */}
        <div style={{ background: "var(--c-primary-lt)", borderRadius: 12, padding: 16, marginTop: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--c-primary)" }}>No account needed</p>
          <p style={{ fontSize: 13, color: "var(--c-primary)", marginTop: 4 }}>
            ParkWatch keeps you anonymous - there's no login. Your {reportCount} report{reportCount === 1 ? "" : "s"} {reportCount === 1 ? "is" : "are"} tracked only on this device.
          </p>
        </div>

        {/* Help & feedback */}
        <div style={{ marginTop: 16, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--c-text)", margin: 0 }}>Help & Feedback</p>
          <p style={{ fontSize: 13, color: "var(--c-muted)", margin: "6px 0 0", lineHeight: 1.5 }}>
            Found a bug or have a question? Email us at{" "}
            <a href="mailto:ParkWatch.feedback@gmail.com" style={{ color: "var(--c-primary)", fontWeight: 600 }}>
              ParkWatch.feedback@gmail.com
            </a>
          </p>
        </div>

        {/* Clear data */}
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          style={{ width: "100%", height: 52, marginTop: 16, background: "var(--c-surface)", border: "1px solid var(--c-danger)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "var(--c-danger)", cursor: "pointer" }}
        >
          <Trash2 size={18} /> Clear my local data
        </button>
        <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 8, textAlign: "center" }}>
          This removes your reports and ID from this device. It cannot be undone, and you'll lose access to tracking those reports.
        </p>
      </div>

      {confirmClear && (
        <div onClick={() => setConfirmClear(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="modal-animate" style={{ background: "var(--c-surface)", borderRadius: 16, padding: 24, maxWidth: 360, width: "100%", textAlign: "center" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)" }}>Clear local data?</h3>
            <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 6 }}>
              Are you sure? Your anonymous ID and all tracked reports will be removed from this device permanently.
            </p>
            <button type="button" onClick={clearData} style={{ width: "100%", height: 52, marginTop: 16, background: "var(--c-danger)", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
              Yes, clear it
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} style={{ width: "100%", background: "none", border: "none", color: "var(--c-muted)", fontSize: 14, marginTop: 14, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
