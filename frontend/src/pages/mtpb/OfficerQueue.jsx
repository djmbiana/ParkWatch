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

const REFRESH_MS = 30000

function TimeLeft({ verifiedAt }) {
  const [display, setDisplay] = useState('')
  const [urgent, setUrgent] = useState(false)

  useEffect(() => {
    if (!verifiedAt) { setDisplay('-'); return }
    const update = () => {
      const mins = Math.floor((Date.now() - new Date(verifiedAt)) / 60000)
      setUrgent(mins < 10)
      if (mins < 60) setDisplay(`${mins} min`)
      else setDisplay(`${Math.floor(mins / 60)}h ${mins % 60}m`)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [verifiedAt])

  const color = urgent ? '#EF4444' : display === '-' ? 'var(--color-text-muted)'
    : parseInt(display) <= 30 ? '#F59E0B' : 'var(--color-text-muted)'

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
  const [resolveModal, setResolveModal] = useState(null)
  const [resolveOutcome, setResolveOutcome] = useState('')
  const [ticketRef, setTicketRef] = useState('')
  const [ticketErr, setTicketErr] = useState('')
  const [resolveLoading, setResolveLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState({})

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
    const r = setInterval(fetchData, REFRESH_MS)
    const t = setInterval(() => setSecAgo(Math.floor((Date.now() - lastFetch.current) / 1000)), 1000)
    return () => { clearInterval(r); clearInterval(t) }
  }, [fetchData])

  const tabCounts = {
    all: data.length,
    repeat: data.filter(r => r.is_repeat_offender).length,
    escalated: data.filter(r => r.is_escalated || r.status === 'escalated').length,
  }

  let filtered = data
  if (tab === 'repeat') filtered = data.filter(r => r.is_repeat_offender)
  if (tab === 'escalated') filtered = data.filter(r => r.is_escalated || r.status === 'escalated')

  const setLoading1 = (id, v) => setActionLoading(p => ({ ...p, [id]: v }))

  const handleAck = async (row) => {
    setLoading1(row.report_id, 'ack')
    try {
      await reports.acknowledge(row.report_id)
      toast('Report acknowledged.', 'success')
      fetchData()
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading1(row.report_id, false) }
  }

  const handleDispatch = async (row) => {
    setLoading1(row.report_id, 'dispatch')
    try {
      await reports.dispatch(row.report_id)
      toast('Report dispatched.', 'success')
      fetchData()
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading1(row.report_id, false) }
  }

  const handleResolveConfirm = async () => {
    if (!resolveOutcome) { setTicketErr('Select a resolution outcome.'); return }
    if ((resolveOutcome === 'Ticket Issued' || resolveOutcome === 'Vehicle Clamped') && !ticketRef.trim()) {
      setTicketErr('Ticket/Clamp reference number is required.')
      return
    }
    setTicketErr('')
    setResolveLoading(true)
    try {
      await reports.resolve(resolveModal.report_id, {
        resolution_outcome: resolveOutcome,
        ticket_reference: ticketRef.trim() || undefined,
      })
      toast('Report resolved successfully.', 'success')
      setResolveModal(null)
      fetchData()
    } catch (e) { toast(e.message, 'error') }
    finally { setResolveLoading(false) }
  }

  const ActionCell = ({ row }) => {
    const busy = actionLoading[row.report_id]
    const isMyReport = row.assigned_officer_id === user?.user_id || row.assigned_officer_id === user?.id

    if (row.status === 'verified') {
      return (
        <button
          onClick={() => handleAck(row)}
          disabled={!!busy}
          style={btnStyle('var(--accent)', '#fff')}
        >
          {busy === 'ack' ? <LoadingSpinner size={12} color="#fff" /> : 'Acknowledge'}
        </button>
      )
    }
    if (row.status === 'acknowledged' && isMyReport) {
      return (
        <button
          onClick={() => handleDispatch(row)}
          disabled={!!busy}
          style={btnStyle('#D97706', '#fff')}
        >
          {busy === 'dispatch' ? <LoadingSpinner size={12} color="#fff" /> : 'Dispatch'}
        </button>
      )
    }
    if (row.status === 'dispatched' && isMyReport) {
      return (
        <button
          onClick={() => { setResolveModal(row); setResolveOutcome(''); setTicketRef(''); setTicketErr('') }}
          style={btnStyle('#10B981', '#fff')}
        >
          Resolve
        </button>
      )
    }
    if (row.status === 'escalated' || row.is_escalated) {
      return (
        <button
          onClick={() => navigate(`/mtpb/officer/reports/${row.report_id}`)}
          style={btnStyle('transparent', '#DC2626', '1.5px solid #DC2626')}
        >
          View
        </button>
      )
    }
    return (
      <button
        onClick={() => navigate(`/mtpb/officer/reports/${row.report_id}`)}
        style={btnStyle('transparent', 'var(--color-text-secondary)', '1px solid var(--color-border)')}
      >
        View
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
                  <td style={{ padding: '0 12px' }}><TimeLeft verifiedAt={row.verified_at} /></td>
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

      {/* Resolve Modal */}
      {resolveModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setResolveModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 480, maxWidth: '90vw', padding: 28, boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Resolve Report RPT-{resolveModal.report_id}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <PlateBadge plate={resolveModal.plate_number} large />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{resolveModal.street_name}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {['Ticket Issued', 'Vehicle Clamped', 'Vehicle No Longer Present'].map(opt => (
                <label
                  key={opt}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '0 16px', height: 48,
                    border: `${resolveOutcome === opt ? 2 : 1}px solid ${resolveOutcome === opt ? 'var(--accent)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: resolveOutcome === opt ? 'var(--accent-soft)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="resolve_outcome"
                    value={opt}
                    checked={resolveOutcome === opt}
                    onChange={() => { setResolveOutcome(opt); setTicketErr('') }}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{opt}</span>
                </label>
              ))}
            </div>
            {(resolveOutcome === 'Ticket Issued' || resolveOutcome === 'Vehicle Clamped') && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                  Ticket / Clamp Reference No. *
                </label>
                <input
                  type="text"
                  value={ticketRef}
                  onChange={e => setTicketRef(e.target.value)}
                  placeholder="e.g. TKT-2025-0034"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6,
                    border: ticketErr ? '1.5px solid #EF4444' : '1px solid var(--color-border)',
                    fontSize: 13, fontFamily: 'JetBrains Mono, monospace',
                    background: 'var(--color-bg)', color: 'var(--color-text-primary)',
                  }}
                />
              </div>
            )}
            {ticketErr && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 12 }}>{ticketErr}</div>}
            <button
              onClick={handleResolveConfirm}
              disabled={resolveLoading}
              style={{
                width: '100%', height: 40, borderRadius: 6,
                background: 'var(--accent)', color: '#fff',
                border: 'none', fontSize: 14, fontWeight: 600,
                cursor: resolveLoading ? 'not-allowed' : 'pointer',
                opacity: resolveLoading ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {resolveLoading && <LoadingSpinner size={14} color="#fff" />}
              Confirm Resolution
            </button>
          </div>
        </div>
      )}
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
