import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Papa from 'papaparse'
import { reports } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import StatCard from '../../components/StatCard'
import PlateBadge from '../../components/PlateBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import ViolationHeatMap from '../../components/ViolationHeatMap'
import useAutoRefresh from '../../hooks/useAutoRefresh'

function downloadCsv(filename, rows) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function SupervisorReports() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const [stats, setStats] = useState({})
  const [repeatOffenders, setRepeatOffenders] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [barangay, setBarangay] = useState('')
  const [genLoading, setGenLoading] = useState('')

  useEffect(() => { setPageTitle('Reports & Analytics') }, [setPageTitle])

  const fetchAll = () => {
    const params = {}
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate
    if (barangay) params.barangay = barangay
    return Promise.all([
      reports.analyticsSum(params).catch(() => null),
      reports.repeatOffenders().catch(() => null),
    ]).then(([s, ro]) => {
      if (s) setStats(s)
      const arr = Array.isArray(ro) ? ro : (ro?.offenders ?? ro?.data ?? [])
      setRepeatOffenders(arr)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [])
  useAutoRefresh(fetchAll, 20000)

  const handleGenRepeat = async () => {
    setGenLoading('repeat')
    try {
      const ro = await reports.repeatOffenders()
      const arr = Array.isArray(ro) ? ro : (ro?.offenders ?? ro?.data ?? [])
      downloadCsv('repeat-offenders.csv', arr.map(r => ({
        plate_number: r.plate_number ?? r.vehicle?.plate_number,
        total_violations: r.total_violations,
        last_violation_date: r.last_violation_date ?? r.submitted_at,
      })))
    } catch { toast('Failed to generate report.', 'error') }
    finally { setGenLoading('') }
  }

  const handleGenEnforcement = async () => {
    setGenLoading('enforcement')
    try {
      const params = {}
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      const s = await reports.analyticsSum(params)
      downloadCsv('enforcement-activity.csv', [s])
    } catch { toast('Failed to generate report.', 'error') }
    finally { setGenLoading('') }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingSpinner size={28} /></div>

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-surface)' }} />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-surface)' }} />
        <button onClick={fetchAll} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Apply
        </button>
      </div>

      {/* 6 Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={stats.reports_submitted ?? 0}   label="Reports Submitted" />
        <StatCard value={stats.reports_resolved ?? 0}    label="Reports Resolved" color="var(--color-resolved)" />
        <StatCard value={stats.pending_now ?? 0}         label="Pending" color="var(--color-pending)" />
        <StatCard value={`${stats.resolution_rate ?? 0}%`} label="Resolution Rate" />
        <StatCard value={`${stats.avg_verify_min ?? 0}m`} label="Avg. Verify Time" />
        <StatCard value={`${stats.avg_mtpb_response_min ?? 0}m`} label="Avg. MTPB Response" />
      </div>

      {/* Report cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Repeat Offender */}
        <div style={{ flex: 1, background: '#0F1117', borderRadius: 'var(--radius-lg)', padding: 24, color: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#E5E7EB', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Repeat Offender Summary
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.total_repeat_offenders ?? repeatOffenders.length}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Repeat Offenders</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.repeat_this_month ?? '-'}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>This Month</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>PHP {(stats.total_fines_issued ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Fines Issued</div>
            </div>
          </div>
          <button onClick={handleGenRepeat} disabled={genLoading === 'repeat'}
            style={{ width: '100%', padding: '10px', borderRadius: 6, background: '#fff', color: '#0F1117', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: genLoading === 'repeat' ? 0.7 : 1 }}>
            {genLoading === 'repeat' ? <LoadingSpinner size={14} color="#0F1117" /> : null}
            Generate Report →
          </button>
        </div>

        {/* Enforcement Activity */}
        <div style={{ flex: 1, background: 'var(--accent)', borderRadius: 'var(--radius-lg)', padding: 24, color: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Enforcement Activity Report
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.reports_submitted ?? 0}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reports Submitted</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.reports_resolved ?? 0}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reports Resolved</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.resolution_rate ?? 0}%</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resolution Rate</div>
            </div>
          </div>
          <button onClick={handleGenEnforcement} disabled={genLoading === 'enforcement'}
            style={{ width: '100%', padding: '10px', borderRadius: 6, background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: genLoading === 'enforcement' ? 0.7 : 1 }}>
            {genLoading === 'enforcement' ? <LoadingSpinner size={14} color="#fff" /> : null}
            Generate Report →
          </button>
        </div>
      </div>

      {/* Street-level violation density heat map */}
      <ViolationHeatMap />

      {/* Repeat offender table */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Repeat Offenders
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
              {['Plate', 'Total Violations', 'Last Violation Date'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repeatOffenders.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: '32px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No repeat offenders found</td></tr>
            ) : repeatOffenders.map((r, i) => (
              <tr key={r.plate_number ?? i} style={{ borderBottom: '1px solid var(--color-border)', height: 48 }}>
                <td style={{ padding: '0 12px' }}><PlateBadge plate={r.plate_number ?? r.vehicle?.plate_number} /></td>
                <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 600 }}>{r.total_violations ?? '-'}</td>
                <td style={{ padding: '0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {r.last_violation_date ? new Date(r.last_violation_date).toLocaleDateString('en-PH') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
