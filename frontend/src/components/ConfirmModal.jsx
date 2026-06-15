import { useEffect } from 'react'
import LoadingSpinner from './LoadingSpinner'

export default function ConfirmModal({
  title, message, confirmLabel = 'Confirm',
  confirmVariant = 'primary', onConfirm, onCancel, loading,
}) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  const confirmBg = confirmVariant === 'danger' ? '#EF4444' : 'var(--accent)'
  const confirmHover = confirmVariant === 'danger' ? '#DC2626' : 'var(--accent-hover)'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div className="modal-animate" style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        width: 480,
        maxWidth: '90vw',
        padding: '28px 32px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '8px 20px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent',
              fontSize: 14, fontWeight: 500,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '8px 20px', borderRadius: 6,
              border: 'none',
              background: confirmBg,
              fontSize: 14, fontWeight: 600,
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = confirmHover }}
            onMouseLeave={e => { e.currentTarget.style.background = confirmBg }}
          >
            {loading && <LoadingSpinner size={14} color="#fff" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
