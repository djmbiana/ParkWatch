import { useEffect, useState, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { reports } from '../../services/api'
import useAutoRefresh from '../../hooks/useAutoRefresh'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import PlateBadge from '../../components/PlateBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import DateRangeFilter, { formatDateRangeLabel, formatCompareLabel } from '../../components/DateRangeFilter'

export default function SupervisorDashboard() {
  const { setPageTitle } = useOutletContext()
  const navigate = useNavigate()
  const [stats, setStats] = useState({})
  const [escalated, setEscalated] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ range: '30d' })

  useEffect(() => { setPageTitle('Overview') }, [setPageTitle])

  const fetchData = useCallback(() => (
    Promise.all([
      reports.analyticsSum(dateRange).catch(() => null),
      // Escalated reports come from the SUPERVISOR queue — the officer queue
      // excludes escalated reports, so it can never surface them here.
      reports.supervisorQueue().catch(() => null),
    ]).then(([s, q]) => {
      if (s) setStats(s)
      setEscalated((q?.reports ?? []).slice(0, 3))
    }).finally(() => setLoading(false))
  ), [dateRange])

  useEffect(() => { fetchData() }, [fetchData])
  useAutoRefresh(fetchData, 15000)

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingSpinner size={28} /></div>

  const compareLabel = formatCompareLabel(stats.date_range)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          All stats reflect <strong style={{ color: 'var(--color-text-secondary)' }}>{formatDateRangeLabel(stats.date_range)}</strong>,
          except cards marked <span style={{ color: 'var(--color-escalated)', fontWeight: 700 }}>LIVE</span>, which update in real time.
        </p>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard value={stats.escalated_now ?? 0}         label="Escalated Now"        color="var(--color-escalated)" live />
        <StatCard value={`${stats.avg_escalation_min ?? 0} min`} label="Avg. Escalation Time" trend={{ pct: stats.trend?.avg_escalation_min, positiveIsGood: false, compareLabel }} />
        <StatCard value={stats.reports_resolved ?? 0}      label="Resolved"              color="var(--color-resolved)" trend={{ pct: stats.trend?.reports_resolved, compareLabel }} />
        <StatCard value={`${stats.resolution_rate ?? 0}%`} label="Resolution Rate" trend={{ pct: stats.trend?.resolution_rate, compareLabel }} />
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
              {['Report', 'Plate', 'Street', 'Status', 'Escalated'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {escalated.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '32px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No escalated reports</td></tr>
            ) : escalated.map(r => (
              <tr key={r.report_id} onClick={() => navigate(`/mtpb/supervisor/escalated`)} style={{ borderBottom: '1px solid var(--color-border)', height: 48, cursor: 'pointer', borderLeft: '3px solid #DC2626' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '0 12px' }}><span className="mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>RPT-{r.report_id}</span></td>
                <td style={{ padding: '0 12px' }}><PlateBadge plate={r.plate_number} /></td>
                <td style={{ padding: '0 12px', fontSize: 13 }}>{r.street_name ?? '-'}</td>
                <td style={{ padding: '0 12px' }}><StatusBadge status={r.status} /></td>
                <td style={{ padding: '0 12px', fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                  {r.escalated_at ? new Date(r.escalated_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
