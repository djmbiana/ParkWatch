import { useEffect, useState, useCallback, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { reports, adminUsers } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import StatCard from '../../components/StatCard'
import PlateBadge from '../../components/PlateBadge'
import PenaltyTierBadge from '../../components/PenaltyTierBadge'
import LoadingSpinner from '../../components/LoadingSpinner'

const REFRESH_MS = 30000

function Elapsed({ escalatedAt }) {
  const [display, setDisplay] = useState('—')

  useEffect(() => {
    if (!escalatedAt) return
    const update = () => {
      const mins = Math.floor((Date.now() - new Date(escalatedAt)) / 60000)
      if (mins < 60) setDisplay(`${mins} min`)
      else setDisplay(`${Math.floor(mins / 60)}h ${mins % 60}m`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [escalatedAt])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#DC2626' }}>
      <AlertTriangle size={12} /> {display}
    </span>
  )
}

export default function SupervisorEscalated() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const [data, setData] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [officers, setOfficers] = useState([])
  const [modal, setModal] = useState(null)
  const [modalTab, setModalTab] = useState('assign')
  const [selectedOfficer, setSelectedOfficer] = useState('')
  const [resolveOutcome, setResolveOutcome] = useState('')
  const [ticketRef, setTicketRef] = useState('')
  const [fieldErr, setFieldErr] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const lastFetch = useRef(Date.now())
  const [secAgo, setSecAgo] = useState(0)

  useEffect(() => { setPageTitle('Escalated Reports') }, [setPageTitle])

  const fetchData = useCallback(() => {
    return Promise.all([
      reports.mtpbQueue().catch(() => null),
      reports.analyticsSum().catch(() => null),
    ]).then(([q, s]) => {
      const arr = Array.isArray(q) ? q : (q?.reports ?? [])
      setData(arr.filter(r => r.is_escalated || r.status === 'escalated'))
      if (s) setStats(s)
      lastFetch.current = Date.now()
      setSecAgo(0)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    adminUsers.officers().then(setOfficers).catch(() => {})
    const r = setInterval(fetchData, REFRESH_MS)
    const t = setInterval(() => setSecAgo(Math.floor((Date.now() - lastFetch.current) / 1000)), 1000)
    return () => { clearInterval(r); clearInterval(t) }
  }, [fetchData])

  const openModal = (row) => {
    setModal(row)
    setModalTab('assign')
    setSelectedOfficer('')
    setResolveOutcome('')
    setTicketRef('')
    setFieldErr('')
  }

  const handleAssign = async () => {
    if (!selectedOfficer) { setFieldErr('Select an officer.'); return }
    setFieldErr('')
    setModalLoading(true)
    try {
      await reports.assign(modal.report_id, { officer_id: selectedOfficer })
      toast('Report assigned to officer.', 'success')
      setModal(null)
      fetchData()
    } catch (e) { toast(e.message, 'error') }
    finally { setModalLoading(false) }
  }

  const handleResolve = async () => {
    if (!resolveOutcome) { setFieldErr('Select a resolution outcome.'); return }
    if ((resolveOutcome === 'Ticket Issued' || resolveOutcome === 'Vehicle Clamped') && !ticketRef.trim()) {
      setFieldErr('Reference number required.'); return
    }
    setFieldErr('')
    setModalLoading(true)
    try {
      await reports.resolve(modal.report_id, { resolution_outcome: resolveOutcome, ticket_reference: ticketRef.trim() || undefined })
      toast('Report resolved.', 'success')
      setModal(null)
      fetchData()
    } catch (e) { toast(e.message, 'error') }
    finally { setModalLoading(false) }
  }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          Reports not acknowledged within the response window
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', marginTop: 16 }}>
        <StatCard value={stats.escalated_now ?? 0}         label="Escalated Now"        color="var(--color-escalated)" />
        <StatCard value={`${stats.avg_escalation_min ?? 0} min`} label="Avg. Escalation Time" />
        <StatCard value={stats.resolved_today ?? 0}        label="Resolved Today"        color="var(--color-resolved)" />
        <StatCard value={`${stats.resolution_rate ?? 0}%`} label="Resolution Rate" />
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Escalated Reports
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Updated {secAgo}s ago</span>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><LoadingSpinner size={28} /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                {['Report', 'Plate', 'Street', 'Penalty Tier', 'Submitted', 'Escalated At', 'Time Elapsed', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No escalated reports</td></tr>
              ) : data.map(row => (
                <tr key={row.report_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48, borderLeft: '3px solid #DC2626' }}>
                  <td style={{ padding: '0 12px' }}><span className="mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>RPT-{row.report_id}</span></td>
                  <td style={{ padding: '0 12px' }}><PlateBadge plate={row.plate_number} /></td>
                  <td style={{ padding: '0 12px', fontSize: 13 }}>{row.street_name ?? '—'}</td>
                  <td style={{ padding: '0 12px' }}><PenaltyTierBadge tier_name={row.tier_name} /></td>
                  <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {row.submitted_at ? new Date(row.submitted_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {row.escalated_at ? new Date(row.escalated_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td style={{ padding: '0 12px' }}><Elapsed escalatedAt={row.escalated_at} /></td>
                  <td style={{ padding: '0 12px' }}>
                    <button onClick={() => openModal(row)}
                      style={{ padding: '4px 14px', borderRadius: 6, background: '#DC2626', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', height: 28 }}>
                      Assign / Resolve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Assign/Resolve Modal */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 520, maxWidth: '90vw', padding: 28, boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Handle Escalated Report RPT-{modal.report_id}</h2>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              {['assign', 'resolve'].map(t => (
                <button key={t} onClick={() => { setModalTab(t); setFieldErr('') }}
                  style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 600, background: modalTab === t ? 'var(--accent)' : 'transparent', color: modalTab === t ? '#fff' : 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}>
                  {t === 'assign' ? 'Assign to Officer' : 'Resolve Directly'}
                </button>
              ))}
            </div>

            {modalTab === 'assign' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                  Select Officer
                </label>
                <select value={selectedOfficer} onChange={e => setSelectedOfficer(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)', marginBottom: 4 }}>
                  <option value="">— Select officer —</option>
                  {officers.map(o => (
                    <option key={o.user_id} value={o.user_id}>
                      {o.first_name} {o.last_name} — Badge #{o.badge_number ?? o.employee_id ?? '—'}
                    </option>
                  ))}
                </select>
                {fieldErr && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{fieldErr}</div>}
                <button onClick={handleAssign} disabled={modalLoading}
                  style={{ marginTop: 12, width: '100%', height: 40, borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: modalLoading ? 'not-allowed' : 'pointer', opacity: modalLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {modalLoading && <LoadingSpinner size={14} color="#fff" />} Assign
                </button>
              </div>
            )}

            {modalTab === 'resolve' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {['Ticket Issued', 'Vehicle Clamped', 'Vehicle No Longer Present'].map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 48, border: `${resolveOutcome === opt ? 2 : 1}px solid ${resolveOutcome === opt ? 'var(--accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: resolveOutcome === opt ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer' }}>
                      <input type="radio" name="sv_outcome" value={opt} checked={resolveOutcome === opt} onChange={() => { setResolveOutcome(opt); setFieldErr('') }} style={{ accentColor: 'var(--accent)' }} />
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{opt}</span>
                    </label>
                  ))}
                </div>
                {(resolveOutcome === 'Ticket Issued' || resolveOutcome === 'Vehicle Clamped') && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                      Reference No. *
                    </label>
                    <input type="text" value={ticketRef} onChange={e => setTicketRef(e.target.value)} placeholder="e.g. TKT-2025-0034"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
                  </div>
                )}
                {fieldErr && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{fieldErr}</div>}
                <button onClick={handleResolve} disabled={modalLoading}
                  style={{ width: '100%', height: 40, borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: modalLoading ? 'not-allowed' : 'pointer', opacity: modalLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {modalLoading && <LoadingSpinner size={14} color="#fff" />} Resolve
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
