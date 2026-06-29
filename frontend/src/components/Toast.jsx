import { X, CheckCircle2, XCircle, Info } from 'lucide-react'

const TYPE_MAP = {
  success: { border: '#10B981', Icon: CheckCircle2 },
  error:   { border: '#EF4444', Icon: XCircle },
  info:    { border: '#3B82F6', Icon: Info },
}

export default function Toast({ message, type = 'info', onClose }) {
  const t = TYPE_MAP[type] ?? TYPE_MAP.info
  const TypeIcon = t.Icon
  return (
    <div className="toast-animate" style={{
      width: 320,
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)',
      borderLeft: `4px solid ${t.border}`,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      <span style={{ color: t.border, flexShrink: 0, marginTop: 1, display: 'inline-flex' }}><TypeIcon size={15} /></span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
        {message}
      </span>
      <button
        onClick={onClose}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 2, color: 'var(--color-text-muted)', flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
