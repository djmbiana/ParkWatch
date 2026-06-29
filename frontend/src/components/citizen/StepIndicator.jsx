// Segmented progress bar for the 3-step wizard, matching the proposal:
// an uppercase "STEP n OF 3 - LABEL" caption above three bar segments.
export default function StepIndicator({ current, total = 3, label }) {
  const segments = Array.from({ length: total }, (_, i) => i + 1)

  return (
    <div>
      <p style={{ textAlign: "center", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-muted)", marginBottom: 10 }}>
        Step {current} of {total}{label ? ` - ${label}` : ""}
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        {segments.map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 999,
              background: s <= current ? "var(--c-primary)" : "var(--c-border)",
            }}
          />
        ))}
      </div>
    </div>
  )
}
