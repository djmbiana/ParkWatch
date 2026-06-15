import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'

export default function AdminAudit() {
  const { setPageTitle } = useOutletContext()
  useEffect(() => { setPageTitle('Audit Log') }, [setPageTitle])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 16px', borderRadius: 999,
        background: 'var(--color-border)', fontSize: 12, fontWeight: 600,
        color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        Coming Soon
      </div>
      <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
        Audit log tracking is planned for a future sprint.
      </div>
    </div>
  )
}
