import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getStoredUser } from '../../utils/auth'

export default function OfficerProfile() {
  const { setPageTitle } = useOutletContext()
  const user = getStoredUser()
  useEffect(() => { setPageTitle('Profile') }, [setPageTitle])

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>
            {`${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase() || 'U'}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{user?.first_name} {user?.last_name}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>MTPB Officer</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
          <div><strong>Email:</strong> {user?.email ?? '—'}</div>
          <div><strong>Badge:</strong> #{user?.badge_number ?? user?.employee_id ?? '—'}</div>
        </div>
        <div style={{ marginTop: 20, padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
          Profile editing will be available in a future sprint.
        </div>
      </div>
    </div>
  )
}
