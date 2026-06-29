import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { citizen, citizenStore } from "../../services/api"
import CitizenHeader from "../../components/citizen/CitizenHeader"
import LoadingSpinner from "../../components/LoadingSpinner"
import StatusBadge from "../../components/StatusBadge"
import StatusTimeline from "../../components/citizen/StatusTimeline"
import { formatDateTime, formatPenalty } from "../../utils/format"

function DetailRow({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 44, padding: "6px 16px", borderBottom: "1px solid var(--c-border)", gap: 16 }}>
      <span style={{ fontSize: 13, color: "var(--c-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: strong ? 600 : 500, color: "var(--c-text)", textAlign: "right" }}>{value ?? "-"}</span>
    </div>
  )
}

export default function ReportDetail() {
  const { reportId } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    citizen.getReport(reportId, citizenStore.getToken(reportId))
      .then((data) => { if (active) setReport(data) })
      .catch((err) => { if (active) setError(err.message || "Could not load this report.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reportId])

  const plate = report?.ocr_extracted_plate || report?.manual_plate_input
  const subtitle = report
    ? [report.street?.street_name, report.street?.barangay_name, report.violation_type].filter(Boolean).join(" · ")
    : ""

  return (
    <div>
      <CitizenHeader title={`Report RPT-${reportId}`} onBack={() => navigate("/citizen/reports")} />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><LoadingSpinner size={24} color="var(--c-primary)" /></div>
      ) : error ? (
        <p style={{ color: "var(--c-danger)", fontSize: 14, padding: 24, textAlign: "center" }}>{error}</p>
      ) : report ? (
        <div style={{ padding: 16 }}>
          {/* RPT id + status */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)" }}>RPT-{report.report_id}</span>
            <StatusBadge status={report.status} />
          </div>

          {/* Photo + plate + subtitle */}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
            {report.photo_url && (
              <img src={report.photo_url} alt="Evidence" onClick={() => setLightbox(true)} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10, cursor: "pointer", flexShrink: 0 }} />
            )}
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)" }}>Plate Number</p>
              <p className="mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--c-primary-dk)" }}>{plate || "-"}</p>
              <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 2 }}>{subtitle}</p>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ marginTop: 20 }}>
            <StatusTimeline report={report} />
          </div>

          {/* Supporting details (UC-02 fields) */}
          <div style={{ marginTop: 16, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, overflow: "hidden" }}>
            <DetailRow label="Plate source" value={report.ocr_extracted_plate ? "Read by OCR" : report.manual_plate_input ? "Entered manually" : "-"} />
            <DetailRow label="Submitted" value={formatDateTime(report.submitted_at)} />
            <DetailRow
              label="Penalty"
              value={formatPenalty(report.penalty_tier)}
              strong
            />
          </div>

          {report.reporter?.anonymous_alias && (
            <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 12, textAlign: "center" }}>
              Submitted as <span style={{ fontWeight: 600, color: "var(--c-text)" }}>{report.reporter.anonymous_alias}</span>
            </p>
          )}
        </div>
      ) : null}

      {lightbox && report?.photo_url && (
        <div onClick={() => setLightbox(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <img src={report.photo_url} alt="Evidence" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      )}
    </div>
  )
}
