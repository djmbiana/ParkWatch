import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { reports } from '../../services/api'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import PlateBadge from '../../components/PlateBadge'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function SupervisorDashboard() {
  const { setPageTitle } = useOutletContext()
  const navigate = useNavigate()
  const [stats, setStats] = useState({})
  const [escalated, setEscalated] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPageTitle('Overview') }, [setPageTitle])

  useEffect(() => {
    Promise.all([
      reports.analyticsSum().catch(() => null),
      // Escalated reports come from the SUPERVISOR queue — the officer queue
      // excludes escalated reports, so it can never surface them here.
      reports.supervisorQueue().catch(() => null),
    ]).then(([s, q]) => {
      if (s) setStats(s)
      setEscalated((q?.reports ?? []).slice(0, 3))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingSpinner size={28} /></div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard value={stats.escalated_now ?? 0}         label="Escalated Now"        color="var(--color-escalated)" />
        <StatCard value={`${stats.avg_escalation_min ?? 0} min`} label="Avg. Escalation Time" />
        <StatCard value={stats.resolved_today ?? 0}        label="Resolved Today"        color="var(--color-resolved)" />
        <StatCard value={`${stats.resolution_rate ?? 0}%`} label="Resolution Rate" />
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Top Escalated Reports
          </span>
          <button onClick={() => navigate('/mtpb/supervisor/escalated')}
            style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            View All →
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
              {['Report', 'Plate', 'Street', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {escalated.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '32px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No escalated reports</td></tr>
            ) : escalated.map(r => (
              <tr key={r.report_id} onClick={() => navigate(`/mtpb/supervisor/escalated`)} style={{ borderBottom: '1px solid var(--color-border)', height: 48, cursor: 'pointer', borderLeft: '3px solid #DC2626' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '0 12px' }}><span className="mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>RPT-{r.report_id}</span></td>
                <td style={{ padding: '0 12px' }}><PlateBadge plate={r.plate_number} /></td>
                <td style={{ padding: '0 12px', fontSize: 13 }}>{r.street_name ?? '-'}</td>
                <td style={{ padding: '0 12px' }}><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
