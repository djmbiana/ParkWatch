import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, Check, FolderOpen, Lock, Plus, ShieldCheck } from "lucide-react"
import { citizen, citizenStore } from "../../services/api"
import LoadingSpinner from "../../components/LoadingSpinner"
import CitizenHeader from "../../components/citizen/CitizenHeader"
import StepIndicator from "../../components/citizen/StepIndicator"
import PhotoCapture from "../../components/citizen/PhotoCapture"
import Dropdown from "../../components/citizen/Dropdown"
import { isValidPlate, isValidConductionPlate, isValidTemporaryPlate, formatPenalty } from "../../utils/format"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_BYTES = 10 * 1024 * 1024

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

const PLATE_TYPES = [
  { key: "regular",    label: "Regular Plate",       hint: "Standard LTO plate (ABC 1234)" },
  { key: "conduction", label: "Conduction Sticker",  hint: "Yellow LTO sticker (e.g. AA 123A)" },
  { key: "temporary",  label: "Temporary Plate",     hint: "White plate with TEMPORARY PLATE label" },
  { key: "no_plate",   label: "No Plate",             hint: "Vehicle with no visible plate" },
]

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
  const [lightbox, setLightbox] = useState(false)
  const previewRef = useRef(null)
  const galleryInputRef = useRef(null)

  // OCR plate (Step 2)
  const [ocrPlate, setOcrPlate] = useState(null)
  const [ocrConfidence, setOcrConfidence] = useState(null)
  const [plate, setPlate] = useState("")

  // Plate type
  const [plateType, setPlateType] = useState("regular")
  // Conduction sticker: two separate fields matching the physical sticker layout.
  // conductionCode = 2-char district code (blue left column), e.g. "AA" or "D1"
  // conductionBody = 4-char body (black area), e.g. "123A" or "E777"
  const [conductionCode, setConductionCode] = useState("")
  const [conductionBody, setConductionBody] = useState("")
  // Temporary plate: 2 letters + 4 digits (4-wheel) or 2 letters + 5 digits (improvised MC)
  const [tempPlateInput, setTempPlateInput] = useState("")

  // Step 2 - location cascade + violation
  const [streets, setStreets] = useState([])
  const [streetsLoading, setStreetsLoading] = useState(true)
  const [selectedBarangay, setSelectedBarangay] = useState(null)
  const [selectedStreet, setSelectedStreet] = useState(null)
  const [vTypes, setVTypes] = useState([])
  const [vLoading, setVLoading] = useState(false)
  const [selectedViolation, setSelectedViolation] = useState(null)

  // Step 3 - penalty + submit
  const [penalty, setPenalty] = useState(null)
  const [penaltyLoading, setPenaltyLoading] = useState(false)
  const [dupInfo, setDupInfo] = useState(null)
  const [showDupModal, setShowDupModal] = useState(false)
  const [dupAttaching, setDupAttaching] = useState(false)
  const [dupAttachPhotos, setDupAttachPhotos] = useState([])
  const dupAttachInputRef = useRef(null)
  const [extraPhotos, setExtraPhotos] = useState([])
  const [extraUploading, setExtraUploading] = useState(false)
  const extraInputRef = useRef(null)
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

  // Derive barangay list from streets
  const barangays = useMemo(() => {
    const seen = new Map()
    streets.forEach(s => {
      if (!seen.has(s.barangay_id)) seen.set(s.barangay_id, { id: s.barangay_id, name: s.barangay_name })
    })
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [streets])

  // Streets filtered by selected barangay
  const filteredStreets = useMemo(() => {
    if (!selectedBarangay) return streets
    return streets.filter(s => s.barangay_id === selectedBarangay.id)
  }, [streets, selectedBarangay])

  // Can proceed from step 2
  const conductionPlate = `${conductionCode} ${conductionBody}`.toUpperCase()
  const plateValid = plateType === "regular"
    ? isValidPlate(plate)
    : plateType === "conduction"
      ? isValidConductionPlate(conductionPlate)
      : plateType === "temporary"
        ? isValidTemporaryPlate(tempPlateInput)
        : true // no_plate
  const canProceedStep2 = plateValid && selectedStreet && selectedViolation

  // Whether the reporter has the access token for the duplicate's existing report
  const hasTokenForDup = !!(dupInfo?.report_id && citizenStore.getToken(dupInfo.report_id))

  // --- Step 1 handlers ---
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
      setPlate(detected)
      setStep(2)
    } catch (err) {
      setProcessError(err.message || "Couldn't read the photo. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  // --- Step 2 handlers ---
  const selectBarangay = (b) => {
    setSelectedBarangay(b)
    setSelectedStreet(null)
    setSelectedViolation(null)
    setVTypes([])
  }

  const selectStreet = (s) => {
    setSelectedStreet(s)
    setSelectedViolation(null)
    setVTypes([])
    setVLoading(true)
    citizen.violationTypes(s.street_id).then(setVTypes).catch(() => {}).finally(() => setVLoading(false))
  }

  // Step 2 → Step 3
  const toReview = async () => {
    let resolvedPlate = plate

    if (plateType === "conduction") {
      resolvedPlate = `${conductionCode.trim().toUpperCase()} ${conductionBody.trim().toUpperCase()}`
      setPlate(resolvedPlate)
    } else if (plateType === "temporary") {
      resolvedPlate = tempPlateInput.trim().toUpperCase().replace(/\s+/g, " ")
      setPlate(resolvedPlate)
    } else if (plateType === "no_plate") {
      // Unique 20-char identifier using Web Crypto (fits VEHICLES.plate_number VARCHAR(20))
      const bytes = new Uint8Array(6)
      crypto.getRandomValues(bytes)
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase()
      resolvedPlate = `NOPLATE_${hex}`
      setPlate(resolvedPlate)
    }

    setStep(3)
    setPenalty(null); setPenaltyLoading(true); setDupInfo(null); setShowDupModal(false)

    if (plateType === "regular") {
      try {
        setPenalty(await citizen.penaltyPreview(resolvedPlate))
      } catch {
        setPenalty(null)
      } finally {
        setPenaltyLoading(false)
      }
    } else {
      setPenaltyLoading(false)
    }

    if (plateType !== "no_plate" && selectedStreet?.street_id) {
      try {
        const dup = await citizen.checkDuplicate(resolvedPlate, selectedStreet.street_id)
        if (dup?.duplicate) {
          setDupInfo(dup)
          setShowDupModal(true)
        }
      } catch {}
    }
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
        plate_type: plateType,
        ocr_extracted_plate: plateType === "regular" ? ocrPlate : null,
        ocr_confidence_score: plateType === "regular" ? ocrConfidence : null,
      }
      if (extraPhotos.length) body.additional_photos = extraPhotos.map(p => p.url)
      const alias = citizenStore.getAlias(); if (alias) body.anonymous_alias = alias
      const fcm = citizenStore.getFcmToken(); if (fcm) body.fcm_token = fcm
      finishSuccess(await citizen.createReport(body))
    } catch (err) {
      // 409 → show the interactive duplicate modal
      if (err.status === 409 && err.data) {
        setDupInfo({
          duplicate: true,
          report_id: err.data.report_id,
          minutes_ago: err.data.minutes_ago,
          street_name: selectedStreet?.street_name,
        })
        setShowDupModal(true)
      } else {
        setSubmitError(
          err?.status === 422
            ? "This violation type is not active for this street."
            : err?.message || "Something went wrong. Please try again."
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  const addExtraPhoto = async (file) => {
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) { setSubmitError("Only photo files are accepted."); return }
    if (file.size > MAX_BYTES) { setSubmitError("Each photo must be under 10MB."); return }
    if (extraPhotos.length >= 5) { setSubmitError("You can add up to 5 extra photos."); return }
    setExtraUploading(true); setSubmitError(null)
    try {
      const { photo_url } = await citizen.uploadPhoto(file)
      setExtraPhotos(p => [...p, { url: photo_url, preview: URL.createObjectURL(file) }])
    } catch (e) {
      setSubmitError(e.message || "Couldn't upload that photo.")
    } finally {
      setExtraUploading(false)
      if (extraInputRef.current) extraInputRef.current.value = ""
    }
  }
  const removeExtraPhoto = (i) => setExtraPhotos(p => p.filter((_, idx) => idx !== i))

  const handleAttachToExisting = async () => {
    if (dupAttachPhotos.length === 0) return
    // token is null for witness reporters — backend accepts witness photos without token.
    const token = dupInfo?.report_id ? citizenStore.getToken(dupInfo.report_id) : null
    setDupAttaching(true)
    try {
      await citizen.attachPhotos(dupInfo.report_id, token, dupAttachPhotos.map(p => p.url))
    } catch {}
    setDupAttaching(false)
    setShowDupModal(false)
    navigate("/citizen/reports")
  }

  const resetWizard = () => {
    setStep(1); setView("wizard")
    setPhotoFile(null); setPhotoUrl(null); setPhotoError(null); setProcessError(null); setPreview(null)
    setOcrPlate(null); setOcrConfidence(null); setPlate(""); setLightbox(false)
    setPlateType("regular"); setConductionInput("")
    setSelectedBarangay(null); setSelectedStreet(null); setSelectedViolation(null); setVTypes([])
    setPenalty(null); setSubmitError(null); setExtraPhotos([])
    setDupInfo(null); setShowDupModal(false); setDupAttachPhotos([])
  }

  const handleBack = () => {
    if (step === 1) navigate("/citizen")
    else setStep(step - 1)
  }

  const alias = citizenStore.getAlias()

  // --- Done screen ---
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
        </div>
      </div>
    )
  }

  return (
    <div>
      <CitizenHeader title={step === 3 ? "Review Report" : "Report a Violation"} onBack={handleBack} />

      <div style={{ padding: 16 }}>
        <StepIndicator current={step} label={LABELS[step]} />

        {/* ──── STEP 1 - capture ──── */}
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
              {processing ? "Analyzing photo..." : "Next"}
            </button>

            {processError && (
              <div style={{ marginTop: 12, background: "var(--c-danger-lt)", borderLeft: "3px solid var(--c-danger)", borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 13, color: "var(--c-danger)" }}>{processError}</p>
                <button type="button" onClick={analyzeAndNext} style={{ background: "none", border: "none", color: "var(--c-danger)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 4 }}>Try again</button>
              </div>
            )}
          </div>
        )}

        {/* ──── STEP 2 - plate type + location + violation ──── */}
        {step === 2 && (
          <div style={{ marginTop: 20 }}>

            {/* Plate type selector */}
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "0 0 10px" }}>Plate Type *</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {PLATE_TYPES.map(pt => (
                <button
                  key={pt.key}
                  type="button"
                  onClick={() => {
                    setPlateType(pt.key)
                    setPlate("")
                    setConductionInput("")
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 6px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 10,
                    border: `2px solid ${plateType === pt.key ? "var(--c-primary)" : "var(--c-border)"}`,
                    background: plateType === pt.key ? "var(--c-primary-lt)" : "var(--c-surface)",
                    color: plateType === pt.key ? "var(--c-primary)" : "var(--c-muted)",
                    cursor: "pointer",
                    lineHeight: 1.3,
                    textAlign: "center",
                  }}
                >
                  {pt.label}
                </button>
              ))}
            </div>

            {/* Plate input — conditional on type */}
            {plateType === "regular" && (
              <div style={{ background: "var(--c-primary-lt)", border: "1px solid var(--c-primary)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
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
                    border: `1px solid ${plate && !isValidPlate(plate) ? "var(--c-danger)" : "var(--c-border)"}`,
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
                {plate && !isValidPlate(plate) && (
                  <p style={{ fontSize: 12, color: "var(--c-danger)", marginTop: 6 }}>Invalid format. Use ABC 1234 or ABC 123 (private) or ABC 12-3456 (motorcycle).</p>
                )}
                <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 6 }}>
                  {ocrConfidence != null
                    ? <>OCR accuracy: <strong style={{ color: "var(--c-primary)" }}>{Number(ocrConfidence).toFixed(1)}%</strong> · edit if it's wrong.</>
                    : ocrPlate
                      ? "Double-check the reading above and fix it if needed."
                      : "Couldn't read the plate automatically - please type it in."}
                </p>
              </div>
            )}

            {plateType === "conduction" && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "0 0 8px" }}>Conduction Sticker Number</p>
                {/* Sticker-style input: yellow background, blue left column (code) + black body */}
                <div style={{
                  background: "#FFC200",
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "stretch",
                  gap: 8,
                  border: "2px solid #B8860B",
                }}>
                  {/* Blue left column — district code (2 chars) */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <input
                      value={conductionCode}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2)
                        setConductionCode(val)
                      }}
                      placeholder="AA"
                      maxLength={2}
                      className="mono"
                      style={{
                        width: 52,
                        height: 64,
                        background: "#1A56DB",
                        border: "none",
                        borderRadius: 6,
                        textAlign: "center",
                        fontSize: 26,
                        fontWeight: 900,
                        color: "#fff",
                        letterSpacing: "0.06em",
                        outline: "none",
                        caretColor: "#fff",
                      }}
                    />
                    <span style={{ fontSize: 9, color: "#7B4F00", fontWeight: 600, marginTop: 3, letterSpacing: "0.04em" }}>CODE</span>
                  </div>
                  {/* Black body — 4-char alphanumeric */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <input
                      value={conductionBody}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)
                        setConductionBody(val)
                      }}
                      placeholder="123A"
                      maxLength={4}
                      className="mono"
                      style={{
                        width: "100%",
                        height: 64,
                        background: "rgba(0,0,0,0.06)",
                        border: "none",
                        borderRadius: 6,
                        textAlign: "center",
                        fontSize: 34,
                        fontWeight: 900,
                        color: "#1A1A1A",
                        letterSpacing: "0.1em",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 9, color: "#7B4F00", fontWeight: 600, marginTop: 3, letterSpacing: "0.04em" }}>STICKER NUMBER</span>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 6 }}>
                  Enter the 2-char district code (blue column) and 4-char number from the yellow sticker.
                  {conductionCode && conductionBody && (
                    <span style={{ fontWeight: 600, color: "var(--c-text)", marginLeft: 4 }}>
                      Preview: {conductionCode.toUpperCase()} {conductionBody.toUpperCase()}
                    </span>
                  )}
                </p>
              </div>
            )}

            {plateType === "temporary" && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "0 0 8px" }}>Temporary / Registered Plate Number</p>
                {/* White plate mock — matches the physical "REGISTERED" dealer plate */}
                <div style={{
                  background: "#fff",
                  border: "3px solid #111",
                  borderRadius: 8,
                  padding: "6px 10px 10px",
                  marginBottom: 8,
                }}>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", textAlign: "center", color: "#222", margin: "0 0 4px" }}>REGISTERED</p>
                  <input
                    value={tempPlateInput}
                    onChange={(e) => {
                      const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "")
                      setTempPlateInput(raw)
                    }}
                    placeholder="AB 1234"
                    maxLength={8}
                    className="mono"
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      textAlign: "center",
                      fontSize: 32,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      color: "#111",
                    }}
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--c-muted)" }}>
                  4-wheel: <strong>AB 1234</strong> (2 letters + 4 digits) &nbsp;|&nbsp;
                  Improvised MC: <strong>AB 12345</strong> (2 letters + 5 digits)
                </p>
              </div>
            )}

            {plateType === "no_plate" && (
              <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 14, padding: 16, marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#92400E", margin: "0 0 4px" }}>No Plate Number</p>
                <p style={{ fontSize: 13, color: "#92400E", margin: 0 }}>A unique case ID will be generated for this report. No plate information is required.</p>
              </div>
            )}

            {/* Location cascade */}
            <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--c-muted)" }}>
              District: <strong style={{ color: "var(--c-text)" }}>Malate, Manila</strong>
            </div>

            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "0 0 8px" }}>Barangay *</p>
            <Dropdown
              value={selectedBarangay}
              options={barangays}
              onChange={selectBarangay}
              loading={streetsLoading}
              placeholder="Select barangay..."
              getKey={(o) => o.id}
              getLabel={(o) => o.name}
              searchable
              searchPlaceholder="Search barangays..."
            />

            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", margin: "16px 0 8px" }}>Street *</p>
            <Dropdown
              value={selectedStreet}
              options={filteredStreets}
              onChange={selectStreet}
              disabled={!selectedBarangay}
              loading={streetsLoading}
              placeholder={selectedBarangay ? "Select a street..." : "Select barangay first"}
              getKey={(o) => o.street_id}
              getLabel={(o) => o.street_name}
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

            <button type="button" disabled={!canProceedStep2} onClick={toReview} style={primaryBtn(!canProceedStep2)}>
              Review Report
            </button>
          </div>
        )}

        {/* ──── STEP 3 - review & submit ──── */}
        {step === 3 && (
          <div style={{ marginTop: 12 }}>

            {/* Hero image - break out of the 16px padding */}
            {photoPreview && (
              <div
                style={{ margin: "0 -16px", position: "relative", cursor: "pointer" }}
                onClick={() => setLightbox(true)}
              >
                <img
                  src={photoPreview}
                  alt="Evidence"
                  style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
                />
                <span style={{ position: "absolute", bottom: 10, right: 12, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 6 }}>
                  Tap to expand
                </span>
              </div>
            )}

            {/* Plate block */}
            <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
              {plateType !== "regular" && (
                <span style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "3px 10px",
                  borderRadius: 999,
                  marginBottom: 8,
                  background: plateType === "conduction" ? "#FFF3CD" : plateType === "temporary" ? "#DCFCE7" : "#FEF9C3",
                  color: plateType === "conduction" ? "#92400E" : plateType === "temporary" ? "#166534" : "#92400E",
                }}>
                  {plateType === "conduction" ? "Conduction Sticker" : plateType === "temporary" ? "Temporary Plate" : "No Plate Number"}
                </span>
              )}
              {plateType !== "no_plate" ? (
                <p className="mono" style={{ fontSize: 28, fontWeight: 800, color: "var(--c-primary-dk)", letterSpacing: "0.04em", margin: 0 }}>
                  {plate || "-"}
                </p>
              ) : (
                <p style={{ fontSize: 16, fontWeight: 600, color: "var(--c-muted)", margin: 0 }}>No plate recorded</p>
              )}
              {plateType === "regular" && ocrConfidence != null && (
                <p style={{ fontSize: 12, color: "var(--c-success)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 4 }}>
                  <Check size={12} strokeWidth={3} /> OCR confidence: {Number(ocrConfidence).toFixed(1)}%
                </p>
              )}
            </div>

            {/* Report details card */}
            <div style={{ marginTop: 12, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 16 }}>
              {[
                ["Street", selectedStreet?.street_name],
                ["Violation", selectedViolation],
                ["Barangay", selectedStreet?.barangay_name],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--c-border)" }}>
                  <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", textAlign: "right" }}>{v ?? "-"}</span>
                </div>
              ))}
              {plateType === "regular" && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ fontSize: 12, color: "var(--c-muted)" }}>Est. Penalty</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-warning)", textAlign: "right" }}>
                    {penaltyLoading ? "..." : formatPenalty(penalty?.penalty_tier)}
                  </span>
                </div>
              )}
            </div>

            {/* Additional evidence photos */}
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", margin: "0 0 4px" }}>
                Additional Photos <span style={{ color: "var(--c-muted)", fontWeight: 400 }}>(optional, up to 5)</span>
              </p>
              <p style={{ fontSize: 12, color: "var(--c-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Add more angles or context to support your report.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {extraPhotos.map((p, i) => (
                  <div key={i} style={{ position: "relative", width: 110, height: 110 }}>
                    <img src={p.preview} alt={`Extra ${i + 1}`} style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 12, border: "1px solid var(--c-border)" }} />
                    <button type="button" onClick={() => removeExtraPhoto(i)} aria-label="Remove"
                      style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%", background: "var(--c-danger)", color: "#fff", border: "2px solid var(--c-surface)", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                ))}
                {extraPhotos.length < 5 && (
                  <button type="button" onClick={() => extraInputRef.current?.click()} disabled={extraUploading}
                    style={{ width: 110, height: 110, borderRadius: 12, border: "1.5px dashed var(--c-border)", background: "var(--c-surface)", color: "var(--c-muted)", cursor: extraUploading ? "wait" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12 }}>
                    {extraUploading ? <LoadingSpinner size={20} /> : <><FolderOpen size={22} /><span>Add</span></>}
                  </button>
                )}
              </div>
              <input ref={extraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
                onChange={e => { addExtraPhoto(e.target.files?.[0]) }} style={{ display: "none" }} />
            </div>

            <div style={{ marginTop: 20, background: "var(--c-primary-lt)", borderRadius: 12, padding: 14, display: "flex", gap: 10 }}>
              <Lock size={16} color="var(--c-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 13, color: "var(--c-primary)" }}>
                Your identity is anonymized. Only <strong>{alias || "your Reporter ID"}</strong> will be visible to enforcement officials.
              </p>
            </div>

            <button type="button" disabled={submitting} onClick={() => setShowConfirm(true)} style={primaryBtn(submitting)}>
              {submitting && <LoadingSpinner size={18} color="#fff" />}
              {submitting ? "Submitting..." : <><Check size={18} strokeWidth={3} /> Submit Report</>}
            </button>

            <p style={{ fontSize: 12, color: "var(--c-muted)", textAlign: "center", margin: "10px 2px 0", lineHeight: 1.5 }}>
              By submitting, you confirm this report is accurate and agree to our{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: "var(--c-primary)", fontWeight: 600 }}>Privacy Notice</a>.
            </p>

            {submitError && (
              <div style={{ marginTop: 12, background: "var(--c-danger-lt)", borderLeft: "3px solid var(--c-danger)", borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 13, color: "var(--c-danger)" }}>{submitError}</p>
                <button type="button" onClick={() => { setSubmitError(null); setShowConfirm(true) }} style={{ background: "none", border: "none", color: "var(--c-danger)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 4 }}>Try again</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ──── Confirm dialog ──── */}
      {showConfirm && (
        <div onClick={() => setShowConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="modal-animate" style={{ background: "var(--c-surface)", borderRadius: 16, padding: 24, maxWidth: 360, width: "100%", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--c-primary-lt)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <ShieldCheck size={26} color="var(--c-primary)" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)", marginTop: 12 }}>Submit this report?</h3>
            <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 6 }}>
              {plateType === "no_plate"
                ? "Confirm the violation details - you can't edit the report after submitting."
                : <>Please double-check the plate <strong className="mono" style={{ color: "var(--c-text)" }}>{plate}</strong> — you can't edit after submitting.</>}
            </p>
            <button type="button" onClick={doSubmit} style={primaryBtn(false)}>Yes, Submit</button>
            <button type="button" onClick={() => setShowConfirm(false)} style={{ width: "100%", background: "none", border: "none", color: "var(--c-muted)", fontSize: 14, marginTop: 14, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ──── Duplicate modal (bottom sheet) ──── */}
      {showDupModal && dupInfo && (
        <div
          onClick={() => !dupAttaching && setShowDupModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, padding: "0 0 0 0" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="modal-animate"
            style={{ background: "var(--c-surface)", borderRadius: "20px 20px 0 0", padding: "24px 20px", maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto" }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--c-border)", margin: "0 auto 20px" }} />

            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#FEF9C3", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <AlertTriangle size={26} color="#D97706" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)", margin: 0 }}>Already Reported</h3>
              <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 8, lineHeight: 1.5 }}>
                This vehicle was reported on <strong style={{ color: "var(--c-text)" }}>{dupInfo.street_name || selectedStreet?.street_name}</strong>
                {dupInfo.minutes_ago > 0 ? ` about ${dupInfo.minutes_ago} min ago` : " just moments ago"}.
                It is already with the authorities.
              </p>
            </div>

            {/* Anyone can add supporting photos — original reporter gets full access,
                witnesses can add up to 3 corroborating photos without a token. */}
            <div style={{ background: "var(--c-primary-lt)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--c-primary)", margin: "0 0 4px" }}>
                {hasTokenForDup ? "Add more photos to your report" : "Add supporting photos"}
              </p>
              <p style={{ fontSize: 12, color: "var(--c-muted)", margin: "0 0 12px" }}>
                {hasTokenForDup
                  ? "Extra photos will help the officers verify this violation."
                  : "Your photos will be attached as corroborating evidence for this report (up to 3)."}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {dupAttachPhotos.map((p, i) => (
                  <div key={i} style={{ position: "relative", width: 70, height: 70 }}>
                    <img src={p.preview} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 10, border: "1px solid var(--c-border)" }} />
                    <button
                      onClick={() => setDupAttachPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ position: "absolute", top: -5, right: -5, width: 20, height: 20, borderRadius: "50%", background: "var(--c-danger)", color: "#fff", border: "none", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >×</button>
                  </div>
                ))}
                {dupAttachPhotos.length < (hasTokenForDup ? 5 : 3) && (
                  <button
                    onClick={() => dupAttachInputRef.current?.click()}
                    style={{ width: 70, height: 70, borderRadius: 10, border: "1.5px dashed var(--c-primary)", background: "transparent", color: "var(--c-primary)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 11 }}
                  >
                    <Plus size={18} /><span>Add</span>
                  </button>
                )}
              </div>
              <input
                ref={dupAttachInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                style={{ display: "none" }}
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file || !ALLOWED_TYPES.includes(file.type) || file.size > MAX_BYTES) return
                  try {
                    const { photo_url } = await citizen.uploadPhoto(file)
                    setDupAttachPhotos(prev => [...prev, { url: photo_url, preview: URL.createObjectURL(file) }])
                  } catch {}
                  e.target.value = ""
                }}
              />
              {dupAttachPhotos.length > 0 && (
                <button
                  onClick={handleAttachToExisting}
                  disabled={dupAttaching}
                  style={{ marginTop: 12, width: "100%", height: 44, background: "var(--c-primary)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: dupAttaching ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {dupAttaching && <LoadingSpinner size={16} color="#fff" />}
                  {dupAttaching ? "Attaching..." : "Attach Photos to Report"}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => { setShowDupModal(false); navigate("/citizen/reports") }}
              style={{ width: "100%", height: 48, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "var(--c-text)", cursor: "pointer", marginBottom: 10 }}
            >
              View My Reports
            </button>

            <button
              type="button"
              onClick={() => setShowDupModal(false)}
              style={{ width: "100%", height: 44, background: "transparent", border: "none", fontSize: 14, color: "var(--c-muted)", cursor: "pointer" }}
            >
              Submit as separate report anyway
            </button>
          </div>
        </div>
      )}

      {/* ──── Photo lightbox ──── */}
      {lightbox && photoPreview && (
        <div onClick={() => setLightbox(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
          <img src={photoPreview} alt="Evidence" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      )}
    </div>
  )
}
