import { useEffect, useRef, useState } from "react"
import { ChevronDown, Search } from "lucide-react"

// Tap-to-open dropdown used for the Step-2 street + violation pickers.
// `options` is an array; `getKey`/`getLabel`/`getSub` read each option.
export default function Dropdown({
  value, options, onChange, placeholder,
  getKey = (o) => o, getLabel = (o) => o, getSub,
  searchable = false, searchPlaceholder = "Search...", disabled = false, loading = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  const filtered = searchable && query
    ? options.filter((o) => `${getLabel(o)} ${getSub ? getSub(o) : ""}`.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
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
        <ChevronDown size={18} color="var(--c-muted)" />
      </button>

      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 30,
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
            overflow: "hidden",
          }}
        >
          {searchable && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--c-border)" }}>
              <Search size={16} color="var(--c-muted)" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 14, background: "transparent" }}
              />
            </div>
          )}
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <p style={{ padding: 14, fontSize: 13, color: "var(--c-muted)" }}>No matches.</p>
            ) : filtered.map((o) => {
              const selected = value && getKey(value) === getKey(o)
              return (
                <div
                  key={getKey(o)}
                  onClick={() => { onChange(o); setOpen(false); setQuery("") }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: 48,
                    padding: "0 14px",
                    cursor: "pointer",
                    background: selected ? "var(--c-primary-lt)" : "transparent",
                    borderLeft: selected ? "3px solid var(--c-primary)" : "3px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500, color: selected ? "var(--c-primary)" : "var(--c-text)" }}>{getLabel(o)}</span>
                  {getSub && <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{getSub(o)}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
