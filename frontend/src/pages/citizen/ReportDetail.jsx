import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, ChevronRight } from "lucide-react"
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
  const [lightbox, setLightbox] = useState(null) // null | 'main'
  const [ssIdx, setSsIdx] = useState(null) // null | number — inline slideshow

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
  const additionalPhotos = Array.isArray(report?.additional_photos) ? report.additional_photos : []

  return (
    <div>
      <CitizenHeader title={`Report RPT-${reportId}`} onBack={() => navigate("/citizen/reports")} />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <LoadingSpinner size={24} color="var(--c-primary)" />
        </div>
      ) : error ? (
        <p style={{ color: "var(--c-danger)", fontSize: 14, padding: 24, textAlign: "center" }}>{error}</p>
      ) : report ? (
        <div>
          {/* Hero photo */}
          {report.photo_url && (
            <div style={{ cursor: "pointer", position: "relative" }} onClick={() => setLightbox("main")}>
              <img
                src={report.photo_url}
                alt="Evidence"
                style={{ width: "100%", height: 240, objectFit: "cover", display: "block" }}
              />
              <span style={{ position: "absolute", bottom: 10, right: 12, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 6 }}>
                Tap to expand
              </span>
            </div>
          )}

          <div style={{ padding: 16 }}>
            {/* RPT id + status */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)" }}>RPT-{report.report_id}</span>
              <StatusBadge status={report.status} />
            </div>

            {/* Plate */}
            {plate && (
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "0 0 4px" }}>Plate Number</p>
                <p className="mono" style={{ fontSize: 28, fontWeight: 800, color: "var(--c-primary-dk)", margin: 0 }}>{plate}</p>
                <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 4 }}>
                  {[report.street?.street_name, report.street?.barangay_name, report.violation_type].filter(Boolean).join(" · ")}
                </p>
              </div>
            )}

            {/* Timeline */}
            <div style={{ marginBottom: 20 }}>
              <StatusTimeline report={report} />
            </div>

            {/* Supporting details */}
            <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, overflow: "hidden" }}>
              <DetailRow label="Plate source" value={report.ocr_extracted_plate ? "Read by OCR" : report.manual_plate_input ? "Entered manually" : "-"} />
              <DetailRow label="Submitted" value={formatDateTime(report.submitted_at)} />
              <DetailRow label="Penalty" value={formatPenalty(report.penalty_tier)} strong />
            </div>

            {/* Decline reason */}
            {(report.status === 'rejected' || report.status === 'contested') && report.rejection_reason && (
              <div style={{ marginTop: 16, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "10px 16px" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#991B1B", margin: "0 0 4px" }}>Reason Declined</p>
                <p style={{ fontSize: 13, color: "#0F1117", margin: 0 }}>{report.rejection_reason}</p>
              </div>
            )}

            {/* Appeal verdict */}
            {report.appeal && report.appeal.status !== 'pending' && (
              <div style={{ marginTop: 16, background: report.appeal.status === 'overturned' ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${report.appeal.status === 'overturned' ? '#A7F3D0' : '#FECACA'}`, borderRadius: 12, padding: "10px 16px" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: report.appeal.status === 'overturned' ? "#065F46" : "#991B1B", margin: "0 0 4px" }}>
                  Appeal {report.appeal.status === 'overturned' ? 'Overturned' : 'Upheld'}
                </p>
                {report.appeal.verdict_notes && (
                  <p style={{ fontSize: 13, color: "#0F1117", margin: 0 }}>{report.appeal.verdict_notes}</p>
                )}
                {report.appeal.status === 'upheld' && (
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                    You may file a Certificate to File Action (CFA) with the barangay office.
                  </p>
                )}
              </div>
            )}

            {/* Additional photos — inline slideshow */}
            {additionalPhotos.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--c-muted)", margin: "0 0 10px" }}>Additional Evidence</p>

                {ssIdx !== null && (
                  <div style={{ position: "relative", background: "#0F1117", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                    <img
                      src={additionalPhotos[ssIdx]}
                      alt={`Evidence ${ssIdx + 1}`}
                      style={{ width: "100%", maxHeight: 300, objectFit: "contain", display: "block" }}
                    />
                    {additionalPhotos.length > 1 && (
                      <>
                        <button
                          onClick={() => setSsIdx((ssIdx - 1 + additionalPhotos.length) % additionalPhotos.length)}
                          style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", padding: "5px 7px", display: "flex" }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          onClick={() => setSsIdx((ssIdx + 1) % additionalPhotos.length)}
                          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", padding: "5px 7px", display: "flex" }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setSsIdx(null)}
                      style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: 4, color: "#fff", fontSize: 11, cursor: "pointer", padding: "3px 8px" }}
                    >
                      Close
                    </button>
                    <div style={{ position: "absolute", bottom: 6, right: 10, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, padding: "2px 7px", borderRadius: 4 }}>
                      {ssIdx + 1} / {additionalPhotos.length}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {additionalPhotos.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Evidence ${i + 1}`}
                      onClick={() => setSsIdx(ssIdx === i ? null : i)}
                      style={{
                        width: 110, height: 110, objectFit: "cover", borderRadius: 12,
                        border: ssIdx === i ? "2px solid var(--c-primary)" : "1px solid var(--c-border)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {report.reporter?.anonymous_alias && (
              <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 16, textAlign: "center" }}>
                Submitted as <span style={{ fontWeight: 600, color: "var(--c-text)" }}>{report.reporter.anonymous_alias}</span>
              </p>
            )}

            <button
              type="button"
              onClick={() => navigate("/citizen/report")}
              style={{ marginTop: 20, width: "100%", height: 52, background: "var(--c-primary)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
            >
              Submit Another Report
            </button>
          </div>
        </div>
      ) : null}

      {/* Main photo lightbox */}
      {lightbox === "main" && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
        >
          <img
            src={report?.photo_url}
            alt="Evidence"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </div>
      )}
    </div>
  )
}
