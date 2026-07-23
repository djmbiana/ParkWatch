import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Papa from 'papaparse'
import { reports } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import StatCard from '../../components/StatCard'
import PlateBadge from '../../components/PlateBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import ViolationHeatMap from '../../components/ViolationHeatMap'
import DateRangeFilter, { formatDateRangeLabel, formatCompareLabel } from '../../components/DateRangeFilter'
import useAutoRefresh from '../../hooks/useAutoRefresh'

// Quotes a single line as one CSV cell so commas inside it (e.g. the comma in
// a localized date/time like "7/23/2026, 9:26:05 PM") can't be misread as
// column delimiters — an unescaped comma here made every downstream row have
// a different column count, which made Excel/Numbers guess the wrong import
// format and garble the whole file.
const csvCell = (text) => `"${String(text).replace(/"/g, '""')}"`

function downloadCsv(filename, rows, title) {
  const lines = []
  if (title) {
    lines.push(csvCell(title))
    lines.push(csvCell(`Generated: ${new Date().toLocaleString('en-PH')}`))
    lines.push('')
  }
  lines.push(Papa.unparse(rows))
  // Leading BOM so Excel (which doesn't assume UTF-8 by default) reads the
  // file's encoding correctly instead of guessing from system locale.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function openHtmlReport(s, repeatOffenders) {
  const metrics = [
    { label: 'Reports Submitted', value: s.reports_submitted ?? 0 },
    { label: 'Reports Resolved', value: s.reports_resolved ?? 0 },
    { label: 'Pending', value: s.pending_now ?? 0 },
    { label: 'Resolution Rate', value: `${s.resolution_rate ?? 0}%` },
    { label: 'Avg. Verify Time', value: `${s.avg_verify_min ?? 0}m` },
    { label: 'Avg. MTPB Response', value: `${s.avg_mtpb_response_min ?? 0}m` },
  ]
  const top = repeatOffenders.slice(0, 8)
  const maxV = Math.max(...top.map(o => o.total_violations ?? 0), 1)
  const barW = 48, barGap = 16, chartH = 160, labelH = 30
  const chartW = (barW + barGap) * top.length + barGap
  const bars = top.map((o, i) => {
    const h = Math.round(((o.total_violations ?? 0) / maxV) * chartH)
    const x = barGap + i * (barW + barGap)
    const plate = o.plate_number ?? o.vehicle?.plate_number ?? '-'
    return `<rect x="${x}" y="${chartH - h}" width="${barW}" height="${h}" fill="#3DA044" rx="4"/>
      <text x="${x + barW / 2}" y="${chartH - h - 5}" text-anchor="middle" font-size="11" font-weight="600" fill="#1F2937">${o.total_violations ?? 0}</text>
      <text x="${x + barW / 2}" y="${chartH + 14}" text-anchor="middle" font-size="9" fill="#6B7280">${plate}</text>`
  }).join('')

  const tRows = top.map(o => `<tr>
    <td>${o.plate_number ?? o.vehicle?.plate_number ?? '-'}</td>
    <td style="text-align:right;font-weight:600">${o.total_violations ?? '-'}</td>
    <td>${o.last_violation_date ? new Date(o.last_violation_date).toLocaleDateString('en-PH') : '-'}</td>
  </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>ParkWatch Enforcement Report</title>
<style>
body{font-family:'Segoe UI',sans-serif;margin:0;padding:32px;background:#F9FAFB;color:#0F1117}
h1{font-size:22px;font-weight:800;color:#3DA044;margin-bottom:4px}
.sub{font-size:13px;color:#6B7280;margin-bottom:32px}
.metrics{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:32px}
.metric{background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:16px 24px;min-width:110px}
.metric .val{font-size:28px;font-weight:800}
.metric .lbl{font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
h2{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:0 0 16px}
.section{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;padding:8px 10px;border-bottom:2px solid #E5E7EB}
td{padding:8px 10px;border-bottom:1px solid #F3F4F6}
@media print{body{background:#fff}}
</style></head><body>
<h1>ParkWatch</h1>
<div class="sub">Enforcement Activity Report &mdash; Period: ${s.date_range?.label ?? 'all time'} &mdash; Generated ${new Date().toLocaleString('en-PH')}</div>
<div class="metrics">${metrics.map(m => `<div class="metric"><div class="val">${m.value}</div><div class="lbl">${m.label}</div></div>`).join('')}</div>
${top.length > 0 ? `<div class="section"><h2>Repeat Offenders (Top ${top.length})</h2>
<svg width="${chartW}" height="${chartH + labelH + 8}" style="display:block;margin-bottom:16px;overflow:visible">
  ${bars}<line x1="0" y1="${chartH}" x2="${chartW}" y2="${chartH}" stroke="#E5E7EB"/>
</svg>
<table><thead><tr><th>Plate</th><th style="text-align:right">Violations</th><th>Last Offense</th></tr></thead>
<tbody>${tRows}</tbody></table></div>` : ''}
</body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

export default function SupervisorReports() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const [stats, setStats] = useState({})
  const [repeatOffenders, setRepeatOffenders] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ range: '30d' })
  const [barangay, setBarangay] = useState('')
  const [genLoading, setGenLoading] = useState('')

  useEffect(() => { setPageTitle('Reports & Analytics') }, [setPageTitle])

  const fetchAll = () => {
    const params = { ...dateRange }
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

  useEffect(() => { fetchAll() }, [dateRange])
  useAutoRefresh(fetchAll, 20000)

  const handleGenRepeat = async () => {
    setGenLoading('repeat')
    try {
      const ro = await reports.repeatOffenders()
      const arr = Array.isArray(ro) ? ro : (ro?.offenders ?? ro?.data ?? [])
      downloadCsv('repeat-offenders.csv', arr.map(r => ({
        'Plate Number': r.plate_number ?? r.vehicle?.plate_number,
        'Total Violations': r.total_violations,
        'Last Violation Date': r.last_violation_date ? new Date(r.last_violation_date).toLocaleDateString('en-PH') : '-',
      })), 'ParkWatch - Repeat Offender Report')
    } catch { toast('Failed to generate report.', 'error') }
    finally { setGenLoading('') }
  }

  const handleGenEnforcement = async () => {
    setGenLoading('enforcement')
    try {
      const s = await reports.analyticsSum(dateRange)
      downloadCsv('enforcement-activity.csv', [{
        'Period': s.date_range?.label ?? 'all time',
        'Reports Submitted': s.reports_submitted ?? 0,
        'Reports Resolved': s.reports_resolved ?? 0,
        'Pending': s.pending_now ?? 0,
        'Resolution Rate (%)': s.resolution_rate ?? 0,
        'Avg. Verify Time (min)': s.avg_verify_min ?? 0,
        'Avg. MTPB Response (min)': s.avg_mtpb_response_min ?? 0,
        'Total Repeat Offenders': s.total_repeat_offenders ?? 0,
        'Total Fines Issued (PHP)': s.total_fines_issued ?? 0,
      }], 'ParkWatch - Enforcement Activity Report')
    } catch { toast('Failed to generate report.', 'error') }
    finally { setGenLoading('') }
  }

  const handleHtmlReport = async () => {
    setGenLoading('html')
    try {
      const [s, ro] = await Promise.all([reports.analyticsSum(dateRange), reports.repeatOffenders()])
      const arr = Array.isArray(ro) ? ro : (ro?.offenders ?? ro?.data ?? [])
      openHtmlReport(s, arr)
    } catch { toast('Failed to generate report.', 'error') }
    finally { setGenLoading('') }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingSpinner size={28} /></div>

  const compareLabel = formatCompareLabel(stats.date_range)

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          All stats reflect <strong style={{ color: 'var(--color-text-secondary)' }}>{formatDateRangeLabel(stats.date_range)}</strong>,
          except cards marked <span style={{ color: 'var(--color-pending)', fontWeight: 700 }}>LIVE</span>, which update in real time.
        </p>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* 6 Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={stats.reports_submitted ?? 0}   label="Reports Submitted" trend={{ pct: stats.trend?.reports_submitted, compareLabel }} />
        <StatCard value={stats.reports_resolved ?? 0}    label="Reports Resolved" color="var(--color-resolved)" trend={{ pct: stats.trend?.reports_resolved, compareLabel }} />
        <StatCard value={stats.pending_now ?? 0}         label="Pending" color="var(--color-pending)" live />
        <StatCard value={`${stats.resolution_rate ?? 0}%`} label="Resolution Rate" trend={{ pct: stats.trend?.resolution_rate, compareLabel }} />
        <StatCard value={`${stats.avg_verify_min ?? 0}m`} label="Avg. Verify Time" trend={{ pct: stats.trend?.avg_verify_min, positiveIsGood: false, compareLabel }} />
        <StatCard value={`${stats.avg_mtpb_response_min ?? 0}m`} label="Avg. MTPB Response" trend={{ pct: stats.trend?.avg_mtpb_response_min, positiveIsGood: false, compareLabel }} />
      </div>

      {/* Report cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Repeat Offender */}
        <div style={{ flex: 1, background: '#0F1117', borderRadius: 'var(--radius-lg)', padding: 24, color: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#E5E7EB', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Repeat Offender Summary
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.total_repeat_offenders ?? repeatOffenders.length}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Repeat Offenders (all time)</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.repeat_this_month ?? '-'}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active in Period</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                PHP {(stats.total_fines_issued ?? 0).toLocaleString()}
                {stats.trend?.total_fines_issued != null && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: stats.trend.total_fines_issued > 0 ? '#6EE7B7' : stats.trend.total_fines_issued < 0 ? '#FCA5A5' : '#9CA3AF' }}>
                    {stats.trend.total_fines_issued > 0 ? '▲' : stats.trend.total_fines_issued < 0 ? '▼' : ''} {Math.abs(stats.trend.total_fines_issued)}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fines Issued This Period</div>
              {stats.trend?.total_fines_issued != null && compareLabel && (
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{compareLabel}</div>
              )}
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 12px' }}>
            "Active in Period" and "Fines Issued" reflect {formatDateRangeLabel(stats.date_range) || 'the selected range'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleGenRepeat} disabled={!!genLoading}
              style={{ flex: 1, padding: '10px', borderRadius: 6, background: '#fff', color: '#0F1117', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: genLoading === 'repeat' ? 0.7 : 1 }}>
              {genLoading === 'repeat' ? <LoadingSpinner size={14} color="#0F1117" /> : null}
              CSV Export
            </button>
            <button onClick={handleHtmlReport} disabled={!!genLoading}
              style={{ flex: 1, padding: '10px', borderRadius: 6, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: genLoading === 'html' ? 0.7 : 1 }}>
              {genLoading === 'html' ? <LoadingSpinner size={14} color="#fff" /> : null}
              HTML Report
            </button>
          </div>
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
          <button onClick={handleGenEnforcement} disabled={!!genLoading}
            style={{ width: '100%', padding: '10px', borderRadius: 6, background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: genLoading === 'enforcement' ? 0.7 : 1 }}>
            {genLoading === 'enforcement' ? <LoadingSpinner size={14} color="#fff" /> : null}
            CSV Export →
          </button>
        </div>
      </div>

      {/* Street-level violation density heat map */}
      <ViolationHeatMap dateRange={dateRange} />

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
