import { ArrowLeft } from "lucide-react"

// Dark navy header used across the report wizard, detail, alerts and account
// screens (matches the proposal mockups). `onBack` renders a "Back" control.
export default function CitizenHeader({ title, onBack }) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "#0F172A",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        height: 52,
        padding: "0 12px",
      }}
    >
      <div style={{ width: 72 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{ background: "none", border: "none", color: "#CBD5E1", display: "flex", alignItems: "center", gap: 4, fontSize: 14, cursor: "pointer", padding: 6 }}
          >
            <ArrowLeft size={18} /> Back
          </button>
        )}
      </div>
      <h1 style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h1>
      <div style={{ width: 72 }} />
    </header>
  )
}
