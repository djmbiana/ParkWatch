import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { adminUsers, reports } from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function SupervisorOfficers() {
  const { setPageTitle } = useOutletContext()
  const [officers, setOfficers] = useState([])
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPageTitle('Officers') }, [setPageTitle])

  useEffect(() => {
    Promise.all([
      adminUsers.officers().catch(() => []),
      reports.mtpbQueue().catch(() => null),
    ]).then(([o, q]) => {
      setOfficers(Array.isArray(o) ? o : [])
      const arr = Array.isArray(q) ? q : (q?.reports ?? [])
      setQueue(arr)
    }).finally(() => setLoading(false))
  }, [])

  const activeCount = (officerId) =>
    queue.filter(r => (r.assigned_officer_id === officerId) && ['acknowledged', 'dispatched'].includes(r.status)).length

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingSpinner size={28} /></div>

  return (
    <div>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          MTPB Officers
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
              {['Name', 'Badge', 'Email', 'Status', 'Active Reports'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {officers.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No officers found</td></tr>
            ) : officers.map(o => (
              <tr key={o.user_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48 }}>
                <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 500 }}>{o.first_name} {o.last_name}</td>
                <td style={{ padding: '0 12px' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    #{o.badge_number ?? o.employee_id ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{o.email}</td>
                <td style={{ padding: '0 12px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
                    borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: o.is_active ? '#ECFDF5' : '#FEF2F2',
                    color: o.is_active ? '#059669' : '#DC2626',
                    textTransform: 'uppercase',
                  }}>
                    {o.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '0 12px', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: activeCount(o.user_id) > 0 ? 'var(--color-dispatched)' : 'var(--color-text-muted)' }}>
                    {activeCount(o.user_id)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
