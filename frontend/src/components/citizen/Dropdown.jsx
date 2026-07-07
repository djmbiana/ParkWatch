import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Search } from "lucide-react"

// Tap-to-open picker that renders as a bottom sheet portal.
// The sheet slides up from the bottom, sits above the fixed BottomNav,
// and gives every option list room to scroll comfortably.
export default function Dropdown({
  value, options, onChange, placeholder,
  getKey = (o) => o, getLabel = (o) => o, getSub,
  searchable = false, searchPlaceholder = "Search...", disabled = false, loading = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const btnRef = useRef(null)

  const close = () => { setOpen(false); setQuery("") }

  // Lock body scroll while sheet is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  const filtered = searchable && query
    ? options.filter((o) =>
        `${getLabel(o)} ${getSub ? getSub(o) : ""}`.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <>
      {/* Trigger button */}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled && !loading) setOpen(true) }}
        style={{
          width: "100%",
          minHeight: 52,
          padding: "0 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--c-surface)",
          border: `1px solid ${open ? "var(--c-primary)" : "var(--c-border)"}`,
          borderRadius: 12,
          fontSize: 15,
          color: value ? "var(--c-text)" : "var(--c-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          textAlign: "left",
        }}
      >
        <span>{loading ? "Loading..." : value ? getLabel(value) : placeholder}</span>
        <ChevronDown
          size={18}
          color="var(--c-muted)"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
        />
      </button>

      {/* Bottom sheet portal */}
      {open && createPortal(
        <div className="citizen-app">
          {/* Backdrop */}
          <div
            onMouseDown={close}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(15,23,42,0.45)",
              zIndex: 59,
            }}
          />

          {/* Sheet */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              maxWidth: 480,
              margin: "0 auto",
              background: "var(--c-surface)",
              borderRadius: "20px 20px 0 0",
              paddingBottom: "env(safe-area-inset-bottom)",
              maxHeight: "72vh",
              display: "flex",
              flexDirection: "column",
              zIndex: 60,
              boxShadow: "0 -4px 24px rgba(15,23,42,0.12)",
            }}
          >
            {/* Drag handle */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--c-border)", margin: "12px auto 4px" }} />

            {/* Header */}
            <div style={{ padding: "8px 16px 12px", borderBottom: "1px solid var(--c-border)" }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--c-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {placeholder}
              </p>
            </div>

            {/* Search */}
            {searchable && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--c-border)" }}>
                <Search size={16} color="var(--c-muted)" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 15, background: "transparent", color: "var(--c-text)" }}
                />
              </div>
            )}

            {/* Options */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filtered.length === 0 ? (
                <p style={{ padding: "16px", fontSize: 14, color: "var(--c-muted)", margin: 0 }}>No matches.</p>
              ) : filtered.map((o, i) => {
                const selected = value && getKey(value) === getKey(o)
                return (
                  <div
                    key={getKey(o)}
                    onMouseDown={(e) => { e.preventDefault(); onChange(o); close() }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      minHeight: 52,
                      padding: "0 16px",
                      cursor: "pointer",
                      background: selected ? "var(--c-primary-lt)" : "var(--c-surface)",
                      borderLeft: selected ? "3px solid var(--c-primary)" : "3px solid transparent",
                      borderTop: i > 0 ? "1px solid var(--c-border)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: selected ? 600 : 400, color: selected ? "var(--c-primary)" : "var(--c-text)" }}>
                      {getLabel(o)}
                    </span>
                    {getSub && (
                      <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{getSub(o)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
