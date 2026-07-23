// trend: { pct: number|null, positiveIsGood?: boolean, compareLabel?: string }
//   pct is % change vs the previous period of equal length (from dateRange.trendPct
//   on the backend). null means the previous period was zero — shown as "New"
//   rather than a misleading infinite percentage. positiveIsGood defaults to true;
//   set it false for metrics where a decrease is the improvement (e.g. avg time).
//   compareLabel (from DateRangeFilter's formatCompareLabel) states what the
//   percentage was measured against, e.g. "vs previous 7 days" — a bare "▼ 48%"
//   with no comparison stated is ambiguous, so this is shown whenever present.
function TrendBadge({ trend }) {
  if (!trend) return null
  const { pct, positiveIsGood = true } = trend
  if (pct === 0) {
    return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>No change</span>
  }
  if (pct == null) {
    return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>New</span>
  }
  const isUp = pct > 0
  const isGood = isUp === positiveIsGood
  const color = isGood ? '#059669' : '#DC2626'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {isUp ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  )
}

// live: true marks a card as a current-moment count (e.g. "Escalated Now")
// that ignores the date-range filter entirely — it's never comparable to a
// prior period, so it never has a trend. The tag sits directly on the card
// it describes instead of relying on a separate sentence elsewhere on the
// page to say which cards are live vs. period-filtered.
function LiveTag() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#DC2626', letterSpacing: '0.04em' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />
      LIVE
    </span>
  )
}

export default function StatCard({ value, label, color, trend, live }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '20px 24px',
      boxShadow: 'var(--shadow-sm)',
      minWidth: 160,
      flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <div style={{
          fontSize: 28,
          fontWeight: 700,
          color: color ?? 'var(--color-text-primary)',
          lineHeight: 1.1,
        }}>
          {value ?? '-'}
        </div>
        <TrendBadge trend={trend} />
        {live && <LiveTag />}
      </div>
      <div style={{
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
      {trend?.compareLabel && (
        <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
          {trend.compareLabel}
        </div>
      )}
    </div>
  )
}
