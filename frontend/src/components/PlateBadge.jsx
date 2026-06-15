export default function PlateBadge({ plate, confidence, manual, large }) {
  if (!plate) return <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No plate</span>

  const isLowConfidence = confidence !== undefined && confidence !== null && confidence < 70
  const isManual = !!manual

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: large ? 16 : 13,
        fontWeight: 500,
        padding: large ? '6px 14px' : '3px 8px',
        background: '#F1F5F9',
        border: `1px solid ${isLowConfidence || isManual ? 'transparent' : '#CBD5E1'}`,
        borderLeft: isLowConfidence || isManual ? '3px solid #F59E0B' : '1px solid #CBD5E1',
        borderRadius: 4,
        color: 'var(--color-text-primary)',
        letterSpacing: '0.05em',
      }}>
        {plate}
      </span>
      {(isLowConfidence || isManual) && (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', paddingLeft: 2 }}>
          Manual
        </span>
      )}
    </span>
  )
}
