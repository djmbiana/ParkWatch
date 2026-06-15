export default function PenaltyTierBadge({ tier_name }) {
  if (!tier_name) return <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>—</span>

  const lower = tier_name.toLowerCase()
  let color, bg, bold
  if (lower.includes('1st')) {
    color = '#059669'; bg = '#ECFDF5'; bold = false
  } else if (lower.includes('2nd')) {
    color = '#D97706'; bg = '#FFFBEB'; bold = false
  } else {
    color = '#DC2626'; bg = '#FEF2F2'; bold = true
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 13,
      fontWeight: bold ? 700 : 600,
      color,
      background: bg,
      whiteSpace: 'nowrap',
    }}>
      {tier_name}
    </span>
  )
}
