const STATUS_MAP = {
  pending:      { label: 'Pending',      color: 'var(--color-pending)',     bg: 'var(--color-pending-bg)' },
  verified:     { label: 'Verified',     color: 'var(--color-verified)',    bg: 'var(--color-verified-bg)' },
  acknowledged: { label: 'Acknowledged', color: 'var(--color-ack)',         bg: 'var(--color-ack-bg)' },
  dispatched:   { label: 'Dispatched',   color: 'var(--color-dispatched)',  bg: 'var(--color-dispatched-bg)' },
  resolved:     { label: 'Resolved',     color: 'var(--color-resolved)',    bg: 'var(--color-resolved-bg)' },
  rejected:     { label: 'Rejected',     color: 'var(--color-rejected)',    bg: 'var(--color-rejected-bg)' },
  escalated:    { label: 'Escalated',    color: 'var(--color-escalated)',   bg: 'var(--color-escalated-bg)' },
}

export default function StatusBadge({ status }) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'var(--color-text-muted)', bg: '#F3F4F6' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      color: s.color,
      background: s.bg,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}
