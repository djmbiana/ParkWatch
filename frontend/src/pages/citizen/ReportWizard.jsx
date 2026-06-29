import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, FolderOpen, Lock, ShieldCheck } from "lucide-react"
import { citizen, citizenStore } from "../../services/api"
import LoadingSpinner from "../../components/LoadingSpinner"
import CitizenHeader from "../../components/citizen/CitizenHeader"
import StepIndicator from "../../components/citizen/StepIndicator"
import PhotoCapture from "../../components/citizen/PhotoCapture"
import Dropdown from "../../components/citizen/Dropdown"
import { isValidPlate, formatPenalty } from "../../utils/format"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_BYTES = 10 * 1024 * 1024

function submitMessage(err) {
  if (err?.status === 409) return "This vehicle was already reported here recently - it's already with the authorities, so there's no need to report it again."
  if (err?.status === 422) return "This violation type is not active for this street."
  return err?.message || "Something went wrong. Please try again."
}

const primaryBtn = (disabled) => ({
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
  opacity: disabled ? 0.5 : 1,
  pointerEvents: disabled ? "none" : "auto",
  cursor: "pointer",
})

const LABELS = { 1: "Capture Photo", 2: "Location & Violation", 3: "Review & Submit" }

export default function ReportWizard() {
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [view, setView] = useState("wizard") // "wizard" | "done"

  // Step 1 - photo
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoError, setPhotoError] = useState(null)
  const [processError, setProcessError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const previewRef = useRef(null)
  const galleryInputRef = useRef(null)

  // OCR plate (Step 2)
  const [ocrPlate, setOcrPlate] = useState(null)
  const [ocrConfidence, setOcrConfidence] = useState(null)
  const [plate, setPlate] = useState("")

  // Step 2 - street + violation
  const [streets, setStreets] = useState([])
  const [streetsLoading, setStreetsLoading] = useState(true)
  const [selectedStreet, setSelectedStreet] = useState(null)
  const [vTypes, setVTypes] = useState([])
  const [vLoading, setVLoading] = useState(false)
  const [selectedViolation, setSelectedViolation] = useState(null)

  // Step 3 - penalty preview + submit
  const [penalty, setPenalty] = useState(null)
  const [penaltyLoading, setPenaltyLoading] = useState(false)
  // Advisory duplicate heads-up (this plate already reported on this street recently)
  const [dupInfo, setDupInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const [result, setResult] = useState(null)

  useEffect(() => {
    let active = true
    citizen.streets()
      .then((rows) => { if (active) setStreets(rows) })
      .catch(() => {})
      .finally(() => { if (active) setStreetsLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current) }, [])

  const setPreview = (url) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = url
    setPhotoPreview(url)
  }

  // --- photo ---
  const handlePhotoSelect = (file) => {
    setProcessError(null)
    if (!ALLOWED_TYPES.includes(file.type)) { setPhotoError("Only photo files are accepted."); return }
    if (file.size > MAX_BYTES) { setPhotoError("Photo must be under 10MB."); return }
    setPhotoError(null)
    setPhotoFile(file)
    setPhotoUrl(null)
    setPreview(URL.createObjectURL(file))
  }

  const handleRetake = () => {
    setPhotoFile(null); setPhotoUrl(null); setPhotoError(null); setProcessError(null); setPreview(null)
  }

  // Step 1 → Step 2: upload, then OCR-preview the plate.
  const analyzeAndNext = async () => {
    if (!photoFile) return
    setProcessing(true); setProcessError(null)
    try {
      const url = photoUrl || (await citizen.uploadPhoto(photoFile)).photo_url
      setPhotoUrl(url)
      const ocr = await citizen.ocrPreview(url)
      const detected = (ocr.extracted_plate || "").toUpperCase()
      setOcrPlate(ocr.extracted_plate || null)
      setOcrConfidence(ocr.confidence_score ?? null)
      setPlate(detected) // pre-fill the editable field with the OCR reading
      setStep(2)
    } catch (err) {
      setProcessError(err.message || "Couldn't read the photo. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  // --- street / violation ---
  const selectStreet = (s) => {
    setSelectedStreet(s)
    setSelectedViolation(null)
    setVTypes([])
    setVLoading(true)
    citizen.violationTypes(s.street_id).then(setVTypes).catch(() => {}).finally(() => setVLoading(false))
  }

  // Step 2 → Step 3: fetch the penalty preview for the confirmed plate, and
  // check whether this vehicle was already reported here recently (advisory).
  const toReview = async () => {
    setStep(3)
    setPenalty(null); setPenaltyLoading(true); setDupInfo(null)
    try {
      setPenalty(await citizen.penaltyPreview(plate))
    } catch {
      setPenalty(null)
    } finally {
      setPenaltyLoading(false)
    }
    try {
      if (selectedStreet?.street_id) {
        const dup = await citizen.checkDuplicate(plate, selectedStreet.street_id)
        if (dup?.duplicate) setDupInfo(dup)
      }
    } catch { /* advisory only - never blocks the flow */ }
  }

  const finishSuccess = (data) => {
    citizenStore.addReportId(data.report_id, data.access_token)
    citizenStore.setAlias(data.anonymous_alias)
    setResult(data)
    setView("done")
  }

  const doSubmit = async () => {
    setShowConfirm(false)
    setSubmitting(true); setSubmitError(null)
    try {
      const body = {
        photo_url: photoUrl,
        street_id: selectedStreet.street_id,
        violation_type: selectedViolation,
        plate,
        ocr_extracted_plate: ocrPlate,
        ocr_confidence_score: ocrConfidence,
      }
      const alias = citizenStore.getAlias(); if (alias) body.anonymous_alias = alias
      const fcm = citizenStore.getFcmToken(); if (fcm) body.fcm_token = fcm
      finishSuccess(await citizen.createReport(body))
    } catch (err) {
      setSubmitError(submitMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const resetWizard = () => {
    setStep(1); setView("wizard")
    setPhotoFile(null); setPhotoUrl(null); setPhotoError(null); setProcessError(null); setPreview(null)
    setOcrPlate(null); setOcrConfidence(null); setPlate("")
    setSelectedStreet(null); setSelectedViolation(null); setVTypes([])
    setPenalty(null); setSubmitError(null)
  }

  const handleBack = () => {
    if (step === 1) navigate("/citizen")
    else setStep(step - 1)
  }

  const plateValid = isValidPlate(plate)
  const alias = citizenStore.getAlias()

  // --- Confirmation view ---
  if (view === "done" && result) {
    return (
      <div>
        <CitizenHeader title="Report Submitted" />
        <div style={{ padding: "32px 16px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div className="citizen-check-pop" style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--c-success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check size={36} strokeWidth={3} color="#fff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--c-text)", marginTop: 20 }}>Report Submitted!</h1>
          <p className="mono" style={{ fontSize: 16, color: "var(--c-muted)", marginTop: 8 }}>RPT-{result.report_id}</p>

          <div style={{ width: "100%", marginTop: 16, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)" }}>Your Anonymous ID</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)", marginTop: 4 }}>{result.anonymous_alias}</p>
            <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>This is your identity on ParkWatch. Keep it private.</p>
          </div>

          <div style={{ width: "100%", marginTop: 12, background: "var(--c-primary-lt)", borderRadius: 12, padding: 16 }}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--c-warning)", background: "var(--c-warning-lt)" }}>
              Pending Verification
            </span>
            <p style={{ fontSize: 13, color: "var(--c-primary)", marginTop: 8 }}>We'll notify you at every step of enforcement.</p>
          </div>

          <button type="button" onClick={() => navigate("/citizen/reports")} style={primaryBtn(false)}>View My Reports</button>
          <button type="button" onClick={resetWizard} style={{ width: "100%", height: 56, marginTop: 12, background: "var(--c-surface)", color: "var(--c-primary)", border: "1px solid var(--c-primary)", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
            Submit Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <CitizenHeader title={step === 3 ? "Review Report" : "Report a Violation"} onBack={handleBack} />

      <div style={{ padding: 16 }}>
        <StepIndicator current={step} label={LABELS[step]} />

        {/* STEP 1 - capture */}
        {step === 1 && (
          <div style={{ marginTop: 20 }}>
            <PhotoCapture preview={photoPreview} onSelect={handlePhotoSelect} onRetake={handleRetake} error={photoError} />

            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--c-text)" }}>Photo Tips</p>
              {["License plate clearly visible", "Avoid extreme angles or blur", "Good lighting improves OCR accuracy"].map((tip) => (
                <div key={tip} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <Check size={16} color="var(--c-success)" strokeWidth={3} />
                  <span style={{ fontSize: 13, color: "var(--c-text)" }}>{tip}</span>
                </div>
              ))}
            </div>

            <p style={{ textAlign: "center", fontSize: 12, color: "var(--c-muted)", margin: "16px 0" }}>- or -</p>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              style={{ width: "100%", height: 52, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "var(--c-text)", cursor: "pointer" }}
            >
              <FolderOpen size={18} color="var(--c-warning)" /> Upload from Gallery
            </button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); e.target.value = "" }}
            />

            <button type="button" disabled={!photoFile || processing} onClick={analyzeAndNext} style={primaryBtn(!photoFile || processing)}>
              {processing && <LoadingSpinner size={18} color="#fff" />}
              {processing ? "Analyzing photo..." : "Next →"}
            </button>

            {processError && (
              <div style={{ marginTop: 12, background: "var(--c-danger-lt)", borderLeft: "3px solid var(--c-danger)", borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 13, color: "var(--c-danger)" }}>{processError}</p>
                <button type="button" onClick={analyzeAndNext} style={{ background: "none", border: "none", color: "var(--c-danger)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 4 }}>Try again</button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 - plate review + location/violation */}
        {step === 2 && (
          <div style={{ marginTop: 20 }}>
            {/* OCR plate card - OCR fills the field; the citizen can edit it,
                with the OCR accuracy shown below. */}
            <div style={{ background: "var(--c-primary-lt)", border: "1px solid var(--c-primary)", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-primary)" }}>OCR Extracted Plate</p>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="e.g., ABC 1234 or ABC 12-3456"
                className="mono"
                style={{
                  width: "100%",
                  height: 52,
                  marginTop: 8,
                  border: `1px solid ${plate && !plateValid ? "var(--c-danger)" : "var(--c-border)"}`,
                  borderRadius: 10,
                  padding: "0 14px",
                  fontSize: 22,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--c-primary-dk)",
                  background: "var(--c-surface)",
                  outline: "none",
                }}
              />
              {plate && !plateValid && (
                <p style={{ fontSize: 12, color: "var(--c-danger)", marginTop: 6 }}>Invalid format. Use ABC 1234 or ABC 123 (private) or ABC 12-3456 (motorcycle).</p>
              )}
              <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 6 }}>
                {ocrConfidence != null
                  ? <>OCR accuracy: <strong style={{ color: "var(--c-primary)" }}>{Number(ocrConfidence).toFixed(1)}%</strong> · edit it above if it's wrong.</>
                  : ocrPlate
                    ? "Double-check the reading above and fix it if needed."
                    : "Couldn't read the plate automatically - please type it in."}
              </p>
              <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>Private: ABC 1234 or ABC 123 · Motorcycle: ABC 12-3456</p>
            </div>

            {/* Street */}
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "20px 0 8px" }}>Street Name *</p>
            <Dropdown
              value={selectedStreet}
              options={streets}
              onChange={selectStreet}
              loading={streetsLoading}
              placeholder="Select a street in Malate..."
              getKey={(o) => o.street_id}
              getLabel={(o) => o.street_name}
              getSub={(o) => o.barangay_name}
              searchable
              searchPlaceholder="Search streets..."
            />

            {/* Violation */}
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "16px 0 8px" }}>Violation Type *</p>
            <Dropdown
              value={selectedViolation ? { violation_type: selectedViolation } : null}
              options={vTypes}
              onChange={(o) => setSelectedViolation(o.violation_type)}
              disabled={!selectedStreet}
              loading={vLoading}
              placeholder={selectedStreet ? "Select violation type..." : "Select a street first"}
              getKey={(o) => o.violation_type}
              getLabel={(o) => o.violation_type}
            />

            <div style={{ marginTop: 12, background: "var(--c-warning-lt)", border: "1px solid var(--c-warning)", borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 13, color: "var(--c-warning)" }}>Violation type is validated against barangay parking rules.</p>
            </div>

            <button type="button" disabled={!plateValid || !selectedStreet || !selectedViolation} onClick={toReview} style={primaryBtn(!plateValid || !selectedStreet || !selectedViolation)}>
              Next →
            </button>
          </div>
        )}

        {/* STEP 3 - review & submit */}
        {step === 3 && (
          <div style={{ marginTop: 20 }}>
            {dupInfo && (
              <div style={{ marginBottom: 16, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 13, color: "#92400E" }}>
                  <strong>This vehicle was already reported here</strong>
                  {dupInfo.minutes_ago != null && ` about ${dupInfo.minutes_ago === 0 ? "a moment" : `${dupInfo.minutes_ago} min`} ago`}.
                  It's already with the authorities - you don't need to report it again. You can still submit if you believe it's a separate incident.
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {photoPreview && <img src={photoPreview} alt="Vehicle" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)" }}>Plate Number</p>
                <p className="mono" style={{ fontSize: 26, fontWeight: 700, color: "var(--c-primary-dk)" }}>{plate}</p>
                {ocrConfidence != null && (
                  <p style={{ fontSize: 12, color: "var(--c-success)", display: "flex", alignItems: "center", gap: 4 }}>
                    <Check size={13} strokeWidth={3} /> OCR Confidence: {Number(ocrConfidence).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>

            <div style={{ marginTop: 16, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 16 }}>
              {[
                ["Street", selectedStreet?.street_name],
                ["Violation", selectedViolation],
                ["Barangay", selectedStreet?.barangay_name],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", textAlign: "right" }}>{v ?? "-"}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ fontSize: 12, color: "var(--c-muted)" }}>Penalty</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-warning)", textAlign: "right" }}>
                  {penaltyLoading ? "…" : formatPenalty(penalty?.penalty_tier)}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 12, background: "var(--c-primary-lt)", borderRadius: 12, padding: 14, display: "flex", gap: 10 }}>
              <Lock size={16} color="var(--c-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 13, color: "var(--c-primary)" }}>
                Your identity is anonymized. Only <strong>{alias || "your Reporter ID"}</strong> will be visible to enforcement officials.
              </p>
            </div>

            <button type="button" disabled={submitting} onClick={() => setShowConfirm(true)} style={primaryBtn(submitting)}>
              {submitting && <LoadingSpinner size={18} color="#fff" />}
              {submitting ? "Submitting..." : <><Check size={18} strokeWidth={3} /> Submit Report</>}
            </button>

            {submitError && (
              <div style={{ marginTop: 12, background: "var(--c-danger-lt)", borderLeft: "3px solid var(--c-danger)", borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 13, color: "var(--c-danger)" }}>{submitError}</p>
                <button type="button" onClick={() => setShowConfirm(true)} style={{ background: "none", border: "none", color: "var(--c-danger)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 4 }}>Try again</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* "Are you sure?" confirmation dialog */}
      {showConfirm && (
        <div onClick={() => setShowConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="modal-animate" style={{ background: "var(--c-surface)", borderRadius: 16, padding: 24, maxWidth: 360, width: "100%", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--c-primary-lt)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <ShieldCheck size={26} color="var(--c-primary)" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)", marginTop: 12 }}>Submit this report?</h3>
            <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 6 }}>
              Are you sure? Please double-check the plate <strong className="mono" style={{ color: "var(--c-text)" }}>{plate}</strong> and details - you can't edit the report after submitting.
            </p>
            <button type="button" onClick={doSubmit} style={primaryBtn(false)}>Yes, Submit</button>
            <button type="button" onClick={() => setShowConfirm(false)} style={{ width: "100%", background: "none", border: "none", color: "var(--c-muted)", fontSize: 14, marginTop: 14, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
