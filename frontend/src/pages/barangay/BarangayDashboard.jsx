import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { reports } from '../../services/api'
import StatCard from '../../components/StatCard'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import PlateBadge from '../../components/PlateBadge'

function fmt(dt) {
  if (!dt) return '-'
  return new Date(dt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
}

export default function BarangayDashboard() {
  const { setPageTitle } = useOutletContext()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ pending: 0, verified: 0, rejected: 0, avg_review_min: 0 })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPageTitle('Dashboard')
  }, [setPageTitle])

  useEffect(() => {
    Promise.all([
      reports.barangayStats().catch(() => null),
      reports.barangayQueue().catch(() => null),
    ]).then(([s, q]) => {
      if (s) setStats(s)
      const arr = Array.isArray(q) ? q : (q?.reports ?? [])
      setRecent(arr.slice(0, 5))
    }).finally(() => setLoading(false))
  }, [])

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

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
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
          emptyMessage="No pending reports today"
          onRowClick={row => navigate(`/barangay/reports/${row.report_id}`)}
        />
      </div>
    </div>
  )
}
