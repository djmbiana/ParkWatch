export default function StatCard({ value, label, color }) {
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
      <div style={{
        fontSize: 28,
        fontWeight: 700,
        color: color ?? 'var(--color-text-primary)',
        lineHeight: 1.1,
        marginBottom: 6,
      }}>
        {value ?? '—'}
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
