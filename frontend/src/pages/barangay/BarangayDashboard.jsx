import { useEffect, useState, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { reports } from '../../services/api'
import useAutoRefresh from '../../hooks/useAutoRefresh'
import StatCard from '../../components/StatCard'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import PlateBadge from '../../components/PlateBadge'
import DateRangeFilter, { formatDateRangeLabel, formatCompareLabel } from '../../components/DateRangeFilter'
import InsightsPanel, { deriveBarangayInsights } from '../../components/InsightsPanel'

function fmt(dt) {
  if (!dt) return '-'
  // Date + time, not time-only — these are the most recent PENDING reports
  // overall (not scoped to today), so a bare "3:45 PM" would be ambiguous
  // for a quiet barangay where the top 5 span more than one day.
  return new Date(dt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function BarangayDashboard() {
  const { setPageTitle } = useOutletContext()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ pending: 0, verified: 0, rejected: 0, avg_review_min: 0, trend: {}, date_range: null })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ range: '30d' })

  useEffect(() => {
    setPageTitle('Dashboard')
  }, [setPageTitle])

  const fetchData = useCallback(() => (
    Promise.all([
      reports.barangayStats(dateRange).catch(() => null),
      reports.barangayQueue().catch(() => null),
    ]).then(([s, q]) => {
      if (s) setStats(s)
      const arr = Array.isArray(q) ? q : (q?.reports ?? [])
      setRecent(arr.slice(0, 5))
    }).finally(() => setLoading(false))
  ), [dateRange])

  useEffect(() => { fetchData() }, [fetchData])
  useAutoRefresh(fetchData, 15000)

  const columns = [
    { key: 'report_id', label: 'Report ID', render: (v) => <span className="mono" style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>RPT-{v}</span> },
    { key: 'submitted_at', label: 'Time', render: (v) => fmt(v) },
    { key: 'plate_number', label: 'Plate', render: (v, row) => <PlateBadge plate={v} confidence={row.ocr_confidence_score} manual={row.manual_plate_input} /> },
    { key: 'street_name', label: 'Street' },
    { key: 'violation_type', label: 'Violation Type' },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'action', label: 'Action', sortable: false,
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/barangay/reports/${row.report_id}`) }}
          style={{
            padding: '4px 14px', borderRadius: 6,
            background: 'var(--accent)', color: '#fff',
            border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            height: 28,
          }}
        >
          Review
        </button>
      ),
    },
  ]

  const compareLabel = formatCompareLabel(stats.date_range)
  const insights = deriveBarangayInsights(stats)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          Showing <strong style={{ color: 'var(--color-text-secondary)' }}>{formatDateRangeLabel(stats.date_range)}</strong>
        </p>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard value={stats.pending ?? 0}          label="Pending"  trend={{ pct: stats.trend?.pending, positiveIsGood: false, compareLabel }} />
        <StatCard value={stats.verified ?? 0}         label="Verified" color="var(--color-verified)" trend={{ pct: stats.trend?.verified, compareLabel }} />
        <StatCard value={stats.rejected ?? 0}         label="Declined" color="var(--color-rejected)" trend={{ pct: stats.trend?.rejected, positiveIsGood: false, compareLabel }} />
        <StatCard value={`${stats.avg_review_min ?? 0} min`} label="Avg. Review Time" trend={{ pct: stats.trend?.avg_review_min, positiveIsGood: false, compareLabel }} />
      </div>

      <InsightsPanel insights={insights} periodLabel={formatDateRangeLabel(stats.date_range)} />

      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Pending Reports
          </span>
          <button
            onClick={() => navigate('/barangay/queue')}
            style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
          >
            View All →
          </button>
        </div>
        <DataTable
          columns={columns}
          data={recent}
          loading={loading}
          emptyMessage="No pending reports"
          onRowClick={row => navigate(`/barangay/reports/${row.report_id}`)}
        />
      </div>
    </div>
  )
}
