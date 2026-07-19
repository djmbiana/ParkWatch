// trend: { pct: number|null, positiveIsGood?: boolean }
//   pct is % change vs the previous period of equal length (from dateRange.trendPct
//   on the backend). null means the previous period was zero — shown as "New"
//   rather than a misleading infinite percentage. positiveIsGood defaults to true;
//   set it false for metrics where a decrease is the improvement (e.g. avg time).
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

export default function StatCard({ value, label, color, trend }) {
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
    </div>
  )
}
