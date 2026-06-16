import { useEffect, useState, useRef, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { reports } from '../../services/api'
import StatCard from '../../components/StatCard'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import PlateBadge from '../../components/PlateBadge'

const REFRESH_MS = 30000

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
}

function OcrCell({ score, manual }) {
  if (manual) return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Manual</span>
  if (score == null) return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>—</span>
  const color = score >= 90 ? '#10B981' : score >= 70 ? '#F59E0B' : '#EF4444'
  return <span style={{ fontSize: 12, fontWeight: 600, color }}>{score.toFixed(0)}%</span>
}

export default function BarangayQueue() {
  const { setPageTitle } = useOutletContext()
  const navigate = useNavigate()
  const [data, setData] = useState([])
  const [stats, setStats] = useState({ pending: 0, verified: 0, rejected: 0, avg_review_min: 0 })
  const [loading, setLoading] = useState(true)
  const [secAgo, setSecAgo] = useState(0)
  const [filterViolation, setFilterViolation] = useState('all')
  const [filterDate, setFilterDate] = useState('today')
  const lastFetch = useRef(Date.now())

  useEffect(() => { setPageTitle('Pending Verification Queue') }, [setPageTitle])

  const fetchData = useCallback(() => {
    return Promise.all([
      reports.barangayQueue().catch(() => null),
      reports.barangayStats().catch(() => null),
    ]).then(([q, s]) => {
      const arr = Array.isArray(q) ? q : (q?.reports ?? [])
      setData(arr)
      if (s) setStats(s)
      lastFetch.current = Date.now()
      setSecAgo(0)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    const refresh = setInterval(fetchData, REFRESH_MS)
    const ticker = setInterval(() => setSecAgo(Math.floor((Date.now() - lastFetch.current) / 1000)), 1000)
    return () => { clearInterval(refresh); clearInterval(ticker) }
  }, [fetchData])

  const violationTypes = ['all', ...new Set(data.map(r => r.violation_type).filter(Boolean))]

  let filtered = data
  if (filterViolation !== 'all') filtered = filtered.filter(r => r.violation_type === filterViolation)
  if (filterDate === 'today') {
    const today = new Date().toDateString()
    filtered = filtered.filter(r => r.submitted_at && new Date(r.submitted_at).toDateString() === today)
  }

  const columns = [
    {
      key: 'report_id', label: 'Report ID',
      render: (v) => <span className="mono" style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>RPT-{v}</span>,
    },
    { key: 'submitted_at', label: 'Time', render: (v) => fmt(v) },
    {
      key: 'plate_number', label: 'Plate',
      render: (v, row) => <PlateBadge plate={v} confidence={row.ocr_confidence_score} manual={row.manual_plate_input} />,
    },
    { key: 'street_name', label: 'Street' },
    {
      key: 'barangay_name', label: 'Barangay',
      render: (v) => <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{v ?? '—'}</span>,
    },
    { key: 'violation_type', label: 'Violation Type' },
    {
      key: 'ocr_confidence_score', label: 'OCR Confidence',
      render: (v, row) => <OcrCell score={v} manual={row.manual_plate_input} />,
    },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'action', label: 'Action', sortable: false,
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/barangay/reports/${row.report_id}`) }}
          style={{
            padding: '4px 14px', borderRadius: 6,
            background: 'var(--accent)', color: '#fff',
            border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28,
          }}
        >
          Review
        </button>
      ),
    },
  ]

  const tableData = filtered.map(r => ({
    ...r,
    _rowBg: r.is_repeat_offender ? '#FEF9F0' : undefined,
    _rowBorderLeft: r.is_repeat_offender ? '3px solid #F59E0B' : undefined,
  }))

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={stats.pending ?? 0}          label="Pending Today" />
        <StatCard value={stats.verified ?? 0}         label="Verified Today" color="var(--color-verified)" />
        <StatCard value={stats.rejected ?? 0}         label="Rejected Today" color="var(--color-rejected)" />
        <StatCard value={`${stats.avg_review_min ?? 0} min`} label="Avg. Review Time" />
      </div>

      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '14px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Queue
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Updated {secAgo}s ago
          </span>
          <select
            value={filterViolation}
            onChange={e => setFilterViolation(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              fontSize: 12, color: 'var(--color-text-secondary)',
              background: 'var(--color-surface)', cursor: 'pointer',
            }}
          >
            {violationTypes.map(v => (
              <option key={v} value={v}>{v === 'all' ? 'All Violations' : v}</option>
            ))}
          </select>
          <select
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              fontSize: 12, color: 'var(--color-text-secondary)',
              background: 'var(--color-surface)', cursor: 'pointer',
            }}
          >
            <option value="today">Today</option>
            <option value="all">All Time</option>
          </select>
        </div>

        <DataTable
          columns={columns}
          data={tableData}
          loading={loading}
          emptyMessage="No pending reports"
          onRowClick={row => navigate(`/barangay/reports/${row.report_id}`)}
        />
      </div>
    </div>
  )
}
