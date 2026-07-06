import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ClipboardX, RefreshCw } from "lucide-react"
import { citizen, citizenStore } from "../../services/api"
import LoadingSpinner from "../../components/LoadingSpinner"
import StatusBadge from "../../components/StatusBadge"
import StatusTimeline from "../../components/citizen/StatusTimeline"
import { formatDateTime, formatPenalty } from "../../utils/format"

const FILTERS = [
  { key: "all",       label: "All" },
  { key: "pending",   label: "Pending",     statuses: ["pending"] },
  { key: "verified",  label: "In Progress", statuses: ["verified", "acknowledged", "dispatched", "escalated"] },
  { key: "resolved",  label: "Resolved",    statuses: ["resolved"] },
  { key: "rejected",  label: "Declined",    statuses: ["rejected", "contested"] },
]

export default function MyReports() {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [expandedId, setExpandedId] = useState(null)
  const [slideshowState, setSlideshowState] = useState({}) // { [report_id]: index | null }
  const [contestState, setContestState] = useState({}) // { [report_id]: { open, reason, loading, done, err } }
  const [lightbox, setLightbox] = useState(null)

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

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id)
    setSlideshowState({})
    setLightbox(null)
  }

  const openSlideshow = (reportId, idx) => {
    setSlideshowState(prev => ({ ...prev, [reportId]: prev[reportId] === idx ? null : idx }))
  }

  const slideshowNext = (reportId, photos) => {
    setSlideshowState(prev => ({ ...prev, [reportId]: ((prev[reportId] ?? 0) + 1) % photos.length }))
  }

  const slideshowPrev = (reportId, photos) => {
    setSlideshowState(prev => ({ ...prev, [reportId]: ((prev[reportId] ?? 0) - 1 + photos.length) % photos.length }))
  }

  const toggleContest = (id) => {
    setContestState(prev => ({
      ...prev,
      [id]: prev[id]?.open ? { ...prev[id], open: false } : { open: true, reason: '', loading: false, done: false, err: '' }
    }))
  }

  const submitContest = async (report) => {
    const id = report.report_id
    const token = citizenStore.getToken(id)
    const reason = contestState[id]?.reason ?? ''
    if (!reason.trim() || reason.trim().length < 10) {
      setContestState(prev => ({ ...prev, [id]: { ...prev[id], err: 'Please provide at least 10 characters.' } }))
      return
    }
    setContestState(prev => ({ ...prev, [id]: { ...prev[id], loading: true, err: '' } }))
    try {
      await citizen.contestReport(id, token, reason.trim())
      setContestState(prev => ({ ...prev, [id]: { ...prev[id], loading: false, done: true, open: false } }))
      load()
    } catch (e) {
      setContestState(prev => ({ ...prev, [id]: { ...prev[id], loading: false, err: e.message || 'Failed to file appeal.' } }))
    }
  }

  return (
    <div>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
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
            style={{ marginTop: 16, background: "var(--c-primary)", color: "#fff", border: "none", borderRadius: 12, height: 48, padding: "0 20px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
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
                  style={{ background: "none", border: "none", borderBottom: `2px solid ${active ? "var(--c-primary)" : "transparent"}`, color: active ? "var(--c-primary)" : "var(--c-muted)", fontSize: 14, fontWeight: 500, padding: "8px 0", whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0 }}
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
            visible.map((r) => {
              const isOpen = expandedId === r.report_id
              const additionalPhotos = Array.isArray(r.additional_photos) ? r.additional_photos : []
              const ssIdx = slideshowState[r.report_id] ?? null
              const cs = contestState[r.report_id]
              const canContest = r.status === 'rejected' && !r.appeal && !cs?.done
              const isContested = r.status === 'contested'
              return (
                <div key={r.report_id} style={{ marginBottom: 12 }}>
                  {/* Card header */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(r.report_id)}
                    onKeyDown={(e) => { if (e.key === "Enter") toggleExpand(r.report_id) }}
                    style={{
                      position: "relative",
                      background: "var(--c-surface)",
                      border: `1px solid ${isOpen ? "var(--c-primary)" : "var(--c-border)"}`,
                      borderRadius: isOpen ? "12px 12px 0 0" : 12,
                      padding: 16,
                      paddingLeft: 20,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, borderRadius: "2px 0 0 2px", background: accentFor(r.status) }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="mono" style={{ fontSize: 12, color: "var(--c-muted)" }}>RPT-{r.report_id}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <StatusBadge status={r.status} />
                        {isOpen ? <ChevronUp size={16} color="var(--c-muted)" /> : <ChevronDown size={16} color="var(--c-muted)" />}
                      </div>
                    </div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: "var(--c-text)", marginTop: 4 }}>{r.violation_type}</p>
                    <p style={{ fontSize: 13, color: "var(--c-muted)" }}>{r.street?.street_name ?? r.street_name ?? "-"}</p>
                    <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 2 }}>{formatDateTime(r.submitted_at) ?? "-"}</p>
                  </div>

                  {/* Inline expanded detail */}
                  {isOpen && (
                    <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-primary)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 16 }}>

                      {/* Hero photo */}
                      {r.photo_url && (
                        <div style={{ margin: "0 -16px", cursor: "pointer" }} onClick={() => setLightbox(lightbox === r.report_id ? null : r.report_id)}>
                          <img src={r.photo_url} alt="Evidence" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                        </div>
                      )}

                      {/* Plate */}
                      {(r.ocr_extracted_plate || r.manual_plate_input) && (
                        <div style={{ textAlign: "center", padding: "16px 0 4px" }}>
                          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "0 0 4px" }}>Plate Number</p>
                          <p className="mono" style={{ fontSize: 24, fontWeight: 800, color: "var(--c-primary-dk)", margin: 0 }}>
                            {r.ocr_extracted_plate || r.manual_plate_input}
                          </p>
                        </div>
                      )}

                      {/* Timeline */}
                      <div style={{ marginTop: 16 }}>
                        <StatusTimeline report={r} />
                      </div>

                      {/* Details */}
                      <div style={{ marginTop: 14, background: "var(--c-bg)", border: "1px solid var(--c-border)", borderRadius: 10, overflow: "hidden" }}>
                        {[
                          ["Street", r.street?.street_name ?? r.street_name],
                          ["Submitted", formatDateTime(r.submitted_at)],
                          ["Penalty", formatPenalty(r.penalty_tier)],
                        ].map(([label, value]) => (
                          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid var(--c-border)" }}>
                            <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{label}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", textAlign: "right" }}>{value ?? "-"}</span>
                          </div>
                        ))}
                      </div>

                      {/* Decline reason + appeal info */}
                      {(r.status === 'rejected' || r.status === 'contested') && r.rejection_reason && (
                        <div style={{ marginTop: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px" }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#991B1B", margin: "0 0 4px" }}>Reason Declined</p>
                          <p style={{ fontSize: 13, color: "#0F1117", margin: 0 }}>{r.rejection_reason}</p>
                        </div>
                      )}

                      {/* Contested — appeal pending */}
                      {isContested && (
                        <div style={{ marginTop: 14, background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: "10px 14px" }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#6D28D9", margin: "0 0 4px" }}>Appeal Under Review</p>
                          <p style={{ fontSize: 13, color: "#0F1117", margin: 0 }}>Your contest has been filed. The barangay will review your case and respond shortly.</p>
                        </div>
                      )}

                      {/* Appeal verdict shown */}
                      {r.appeal && r.appeal.status !== 'pending' && (
                        <div style={{ marginTop: 14, background: r.appeal.status === 'overturned' ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${r.appeal.status === 'overturned' ? '#A7F3D0' : '#FECACA'}`, borderRadius: 10, padding: "10px 14px" }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: r.appeal.status === 'overturned' ? "#065F46" : "#991B1B", margin: "0 0 4px" }}>
                            Appeal {r.appeal.status === 'overturned' ? 'Overturned' : 'Upheld'}
                          </p>
                          {r.appeal.verdict_notes && (
                            <p style={{ fontSize: 13, color: "#0F1117", margin: 0 }}>{r.appeal.verdict_notes}</p>
                          )}
                          {r.appeal.status === 'upheld' && (
                            <p style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                              You may file a Certificate to File Action (CFA) with the barangay office to further pursue this matter.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Contest button — only for declined (not yet appealed) */}
                      {canContest && !cs?.open && (
                        <button
                          type="button"
                          onClick={() => toggleContest(r.report_id)}
                          style={{ marginTop: 14, width: "100%", height: 44, background: "transparent", color: "#EF4444", border: "1.5px solid #EF4444", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                        >
                          Contest this Decision
                        </button>
                      )}

                      {/* Contest form */}
                      {canContest && cs?.open && (
                        <div style={{ marginTop: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: 14 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#991B1B", margin: "0 0 8px" }}>Contest this Decision</p>
                          <p style={{ fontSize: 12, color: "#4B5563", margin: "0 0 10px" }}>
                            Explain why you believe this report should be reconsidered. You can only contest once.
                          </p>
                          <textarea
                            value={cs.reason}
                            onChange={e => setContestState(prev => ({ ...prev, [r.report_id]: { ...prev[r.report_id], reason: e.target.value } }))}
                            rows={3}
                            placeholder="Describe your grounds for contesting..."
                            style={{ width: "100%", borderRadius: 8, border: "1px solid #FECACA", padding: "8px 12px", fontSize: 13, color: "#0F1117", background: "#fff", resize: "vertical", fontFamily: "Inter, sans-serif" }}
                          />
                          {cs.err && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>{cs.err}</p>}
                          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                            <button
                              onClick={() => submitContest(r)}
                              disabled={cs.loading}
                              style={{ flex: 1, height: 40, background: "#EF4444", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: cs.loading ? "not-allowed" : "pointer", opacity: cs.loading ? 0.7 : 1 }}
                            >
                              {cs.loading ? "Submitting..." : "Submit Appeal"}
                            </button>
                            <button
                              onClick={() => toggleContest(r.report_id)}
                              style={{ flex: 1, height: 40, background: "transparent", color: "#6B7280", border: "1px solid var(--c-border)", borderRadius: 10, fontSize: 14, cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Additional photos — inline slideshow */}
                      {additionalPhotos.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--c-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>Additional Photos</p>

                          {ssIdx !== null && (
                            <div style={{ position: "relative", background: "#0F1117", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
                              <img
                                src={additionalPhotos[ssIdx]}
                                alt={`Extra ${ssIdx + 1}`}
                                style={{ width: "100%", maxHeight: 280, objectFit: "contain", display: "block" }}
                              />
                              {additionalPhotos.length > 1 && (
                                <>
                                  <button onClick={() => slideshowPrev(r.report_id, additionalPhotos)}
                                    style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", padding: "5px 7px", display: "flex" }}>
                                    <ChevronLeft size={16} />
                                  </button>
                                  <button onClick={() => slideshowNext(r.report_id, additionalPhotos)}
                                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", padding: "5px 7px", display: "flex" }}>
                                    <ChevronRight size={16} />
                                  </button>
                                </>
                              )}
                              <button onClick={() => setSlideshowState(prev => ({ ...prev, [r.report_id]: null }))}
                                style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: 4, color: "#fff", fontSize: 11, cursor: "pointer", padding: "3px 8px" }}>
                                Close
                              </button>
                              <div style={{ position: "absolute", bottom: 6, right: 10, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, padding: "2px 7px", borderRadius: 4 }}>
                                {ssIdx + 1} / {additionalPhotos.length}
                              </div>
                            </div>
                          )}

                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {additionalPhotos.map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt={`Extra ${i + 1}`}
                                onClick={() => openSlideshow(r.report_id, i)}
                                style={{
                                  width: 80, height: 80, objectFit: "cover", borderRadius: 10,
                                  border: ssIdx === i ? "2px solid var(--c-primary)" : "1px solid var(--c-border)",
                                  cursor: "pointer",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Hero photo lightbox */}
      {lightbox != null && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
        >
          {(() => {
            const r = reports.find(x => x.report_id === lightbox)
            return r?.photo_url ? <img src={r.photo_url} alt="Evidence" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : null
          })()}
        </div>
      )}
    </div>
  )
}

function accentFor(status) {
  switch (status) {
    case "pending":      return "var(--c-warning)"
    case "verified":
    case "acknowledged":
    case "dispatched":   return "var(--c-primary)"
    case "resolved":     return "var(--c-success)"
    case "contested":    return "#7C3AED"
    case "rejected":
    case "escalated":    return "var(--c-danger)"
    default:             return "var(--c-border)"
  }
}
