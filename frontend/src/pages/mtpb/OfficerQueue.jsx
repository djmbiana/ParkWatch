import { useEffect, useState, useRef, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { reports } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import { getStoredUser } from '../../utils/auth'
import StatusBadge from '../../components/StatusBadge'
import PlateBadge from '../../components/PlateBadge'
import PenaltyTierBadge from '../../components/PenaltyTierBadge'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingSpinner from '../../components/LoadingSpinner'
import useAutoRefresh from '../../hooks/useAutoRefresh'

const REFRESH_MS = 15000

function TimeLeft({ deadline }) {
  const [display, setDisplay] = useState('')
  const [urgent, setUrgent] = useState(false)

  useEffect(() => {
    if (!deadline) { setDisplay('-'); setUrgent(false); return }
    const update = () => {
      const msLeft = new Date(deadline) - Date.now()
      if (msLeft <= 0) {
        setUrgent(true)
        setDisplay('Overdue')
        return
      }
      const secsLeft = Math.ceil(msLeft / 1000)
      const minsLeft = Math.floor(msLeft / 60000)
      setUrgent(minsLeft < 5)
      if (secsLeft < 120) setDisplay(`${secsLeft}s`)
      else if (minsLeft < 60) setDisplay(`${minsLeft} min`)
      else setDisplay(`${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadline])

  const color = urgent ? '#EF4444' : display === '-' ? 'var(--color-text-muted)'
    : '#F59E0B'

  return <span style={{ fontSize: 12, fontWeight: 600, color }}>{display}</span>
}

function PriorityCell({ row }) {
  if (row.is_escalated) return <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> HIGH</span>
  const tier = (row.tier_name ?? '').toLowerCase()
  if (tier.includes('2nd') || tier.includes('3rd')) return <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> MED</span>
  return <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)' }}>STD</span>
}

const TABS = ['all', 'repeat', 'escalated']
const TAB_LABELS = { all: 'All', repeat: 'Repeat Offenders', escalated: 'Escalated' }

export default function OfficerQueue() {
  const { setPageTitle } = useOutletContext()
  const navigate = useNavigate()
  const toast = useToast()
  const user = getStoredUser()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [secAgo, setSecAgo] = useState(0)
  const lastFetch = useRef(Date.now())

  useEffect(() => { setPageTitle('Enforcement Queue') }, [setPageTitle])

  const fetchData = useCallback(() => {
    return reports.mtpbQueue().then(q => {
      const arr = Array.isArray(q) ? q : (q?.reports ?? [])
      const sorted = [...arr].sort((a, b) => {
        if (a.is_escalated && !b.is_escalated) return -1
        if (!a.is_escalated && b.is_escalated) return 1
        if (a.is_repeat_offender && !b.is_repeat_offender) return -1
        if (!a.is_repeat_offender && b.is_repeat_offender) return 1
        return new Date(a.verified_at) - new Date(b.verified_at)
      })
      setData(sorted)
      lastFetch.current = Date.now()
      setSecAgo(0)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    const t = setInterval(() => setSecAgo(Math.floor((Date.now() - lastFetch.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [fetchData])
  useAutoRefresh(fetchData, REFRESH_MS)

  const tabCounts = {
    all: data.length,
    repeat: data.filter(r => r.is_repeat_offender).length,
    escalated: data.filter(r => r.is_escalated || r.status === 'escalated').length,
  }

  let filtered = data
  if (tab === 'repeat') filtered = data.filter(r => r.is_repeat_offender)
  if (tab === 'escalated') filtered = data.filter(r => r.is_escalated || r.status === 'escalated')

  // Actions ALWAYS open the report detail first — the officer must review the
  // report (photos, plate, history) before acknowledging/dispatching/resolving,
  // which happens on the detail page. This prevents dispatching blind from the queue.
  const ActionCell = ({ row }) => {
    const isMyReport = row.assigned_officer_id === user?.user_id || row.assigned_officer_id === user?.id
    let label = 'View'
    let style = btnStyle('transparent', 'var(--color-text-secondary)', '1px solid var(--color-border)')

    if (row.status === 'escalated' || row.is_escalated) {
      label = 'Review'
      style = btnStyle('transparent', '#DC2626', '1.5px solid #DC2626')
    } else if (row.status === 'verified') {
      label = 'Review & Acknowledge'
      style = btnStyle('var(--accent)', '#fff')
    } else if (row.status === 'acknowledged' && isMyReport) {
      label = 'Review & Dispatch'
      style = btnStyle('#D97706', '#fff')
    } else if (row.status === 'dispatched' && isMyReport) {
      label = 'Review & Resolve'
      style = btnStyle('#10B981', '#fff')
    }

    return (
      <button onClick={() => navigate(`/mtpb/officer/reports/${row.report_id}`)} style={style}>
        {label}
      </button>
    )
  }

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px', borderRadius: 999,
              fontSize: 13, fontWeight: 500,
              background: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--color-text-secondary)',
              border: tab === t ? 'none' : '1px solid var(--color-border)',
              cursor: 'pointer',
            }}
          >
            {TAB_LABELS[t]} ({tabCounts[t]})
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
          Updated {secAgo}s ago
        </span>
      </div>

      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}><LoadingSpinner size={28} /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                {['Priority', 'Report', 'Plate', 'Street', 'Penalty Tier', 'Time Left', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No reports in this category</td></tr>
              ) : filtered.map(row => (
                <tr
                  key={row.report_id}
                  onClick={() => navigate(`/mtpb/officer/reports/${row.report_id}`)}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    height: 48,
                    cursor: 'pointer',
                    borderLeft: row.is_escalated ? '3px solid #DC2626'
                      : row.is_repeat_offender ? '3px solid #F59E0B'
                      : '3px solid transparent',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '0 12px' }}><PriorityCell row={row} /></td>
                  <td style={{ padding: '0 12px' }}><span className="mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>RPT-{row.report_id}</span></td>
                  <td style={{ padding: '0 12px' }}><PlateBadge plate={row.plate_number} confidence={row.ocr_confidence_score} manual={row.manual_plate_input} /></td>
                  <td style={{ padding: '0 12px', fontSize: 13 }}>{row.street_name ?? '-'}</td>
                  <td style={{ padding: '0 12px' }}><PenaltyTierBadge tier_name={row.tier_name} /></td>
                  <td style={{ padding: '0 12px' }}><TimeLeft deadline={row.response_deadline} /></td>
                  <td style={{ padding: '0 12px' }}><StatusBadge status={row.status} /></td>
                  <td style={{ padding: '0 12px' }} onClick={e => e.stopPropagation()}>
                    <ActionCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function btnStyle(bg, color, border) {
  return {
    padding: '4px 12px', borderRadius: 6,
    background: bg, color,
    border: border ?? 'none',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28,
    display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
  }
}
