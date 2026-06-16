import { useRef } from "react"
import { Camera } from "lucide-react"

// Photo capture area. `preview` is an object URL (or null). Validation lives in
// the parent (ReportWizard); `error` renders below the area when set.
export default function PhotoCapture({ preview, onSelect, onRetake, error }) {
  const fileInputRef = useRef(null)

  const handleChange = (e) => {
    const file = e.target.files?.[0]
    if (file) onSelect(file)
    // Reset so selecting the same file again still fires onChange.
    e.target.value = ""
  }

  return (
    <div>
      <div
        onClick={() => { if (!preview) fileInputRef.current?.click() }}
        style={{
          background: "var(--c-surface)",
          border: "2px dashed var(--c-border)",
          borderRadius: 16,
          height: 240,
          position: "relative",
          overflow: "hidden",
          cursor: preview ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Vehicle"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetake() }}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--c-text)",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              }}
            >
              Retake
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 16 }}>
            <Camera size={48} color="var(--c-muted)" strokeWidth={1.5} style={{ margin: "0 auto" }} />
            <p style={{ fontSize: 16, fontWeight: 500, color: "var(--c-text)", marginTop: 12 }}>
              Tap to take photo
            </p>
            <p style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 4 }}>
              Point camera at the license plate
            </p>
          </div>
        )}
      </div>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={handleChange}
      />

      {error && (
        <p style={{ fontSize: 13, color: "var(--c-danger)", marginTop: 8 }}>{error}</p>
      )}
    </div>
  )
}
