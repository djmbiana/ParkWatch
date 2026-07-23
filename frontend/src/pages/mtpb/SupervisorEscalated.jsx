import { useEffect, useState, useCallback, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import { reports, adminUsers, adminConfig } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import StatCard from '../../components/StatCard'
import PlateBadge from '../../components/PlateBadge'
import PenaltyTierBadge from '../../components/PenaltyTierBadge'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import DateRangeFilter, { formatDateRangeLabel, formatCompareLabel } from '../../components/DateRangeFilter'
import useAutoRefresh from '../../hooks/useAutoRefresh'

const REFRESH_MS = 15000

function Elapsed({ escalatedAt }) {
  const [display, setDisplay] = useState('-')

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

function KV({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0F1117', fontWeight: 500 }}>{children ?? '-'}</div>
    </div>
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
  const [modalTab, setModalTab] = useState('details')
  const [detailReport, setDetailReport] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedOfficer, setSelectedOfficer] = useState('')
  const [resolveOutcome, setResolveOutcome] = useState('')
  const [ticketRef, setTicketRef] = useState('')
  const [fieldErr, setFieldErr] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const lastFetch = useRef(Date.now())
  const [secAgo, setSecAgo] = useState(0)
  const [dateRange, setDateRange] = useState({ range: '30d' })

  // Escalation config
  const [showConfig, setShowConfig] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [responseWindow, setResponseWindow] = useState('')
  const [renotifyWindow, setRenotifyWindow] = useState('')

  useEffect(() => { setPageTitle('Escalated Reports') }, [setPageTitle])

  const fetchData = useCallback(() => {
    return reports.supervisorQueue(dateRange).then((q) => {
      setData(q?.reports ?? [])
      if (q?.stats) setStats(q.stats)
      lastFetch.current = Date.now()
      setSecAgo(0)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [dateRange])

  useEffect(() => {
    fetchData()
    adminUsers.officers().then(o => setOfficers(Array.isArray(o) ? o : [])).catch(() => {})
    const t = setInterval(() => setSecAgo(Math.floor((Date.now() - lastFetch.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [fetchData])
  useAutoRefresh(fetchData, REFRESH_MS)

  const loadConfig = useCallback(() => {
    if (configLoading) return
    setConfigLoading(true)
    adminConfig.getEscalation().then(rows => {
      const map = Object.fromEntries((Array.isArray(rows) ? rows : []).map(r => [r.config_key, r.config_value]))
      setResponseWindow(map['escalation_response_window_minutes'] ?? '60')
      setRenotifyWindow(map['escalation_renotify_window_minutes'] ?? '15')
    }).catch(() => {}).finally(() => setConfigLoading(false))
  }, [])

  const toggleConfig = () => {
    if (!showConfig) loadConfig()
    setShowConfig(v => !v)
  }

  const saveConfig = async () => {
    setConfigSaving(true)
    try {
      await adminConfig.updateEscalation({
        response_window_minutes: parseInt(responseWindow, 10),
        renotify_window_minutes: parseInt(renotifyWindow, 10),
      })
      toast('Escalation timing saved.', 'success')
    } catch (e) { toast(e.message || 'Failed to save.', 'error') }
    finally { setConfigSaving(false) }
  }

  const openModal = (row) => {
    setModal(row)
    setModalTab('details')
    setDetailReport(null)
    setSelectedOfficer('')
    setResolveOutcome('')
    setTicketRef('')
    setFieldErr('')
    // Eagerly fetch full detail
    setDetailLoading(true)
    reports.getById(row.report_id).then(setDetailReport).catch(() => {}).finally(() => setDetailLoading(false))
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

  const compareLabel = formatCompareLabel(stats.date_range)

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          Reports not acknowledged within the response window
        </p>
      </div>

      {/* Escalation Config Panel */}
      <div style={{ marginBottom: 20, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <button onClick={toggleConfig}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={15} color="var(--accent)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0F1117' }}>Escalation Timing Settings</span>
          </div>
          {showConfig ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {showConfig && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-border)' }}>
            {configLoading ? (
              <div style={{ paddingTop: 12, display: 'flex', justifyContent: 'center' }}><LoadingSpinner size={20} /></div>
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 14, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Response Window (min)
                  </label>
                  <input type="number" min={1} max={1440} value={responseWindow} onChange={e => setResponseWindow(e.target.value)}
                    style={{ width: 100, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: '#0F1117' }} />
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>Before re-notification</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Re-notify Window (min)
                  </label>
                  <input type="number" min={1} max={120} value={renotifyWindow} onChange={e => setRenotifyWindow(e.target.value)}
                    style={{ width: 100, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: '#0F1117' }} />
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>Before escalation</div>
                </div>
                <button onClick={saveConfig} disabled={configSaving}
                  style={{ height: 34, padding: '0 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: configSaving ? 'not-allowed' : 'pointer', opacity: configSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {configSaving && <LoadingSpinner size={12} color="#fff" />} Save
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          All stats reflect <strong style={{ color: 'var(--color-text-secondary)' }}>{formatDateRangeLabel(stats.date_range)}</strong>,
          except cards marked <span style={{ color: 'var(--color-escalated)', fontWeight: 700 }}>LIVE</span>, which update in real time.
        </p>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={stats.escalated_now ?? 0}         label="Escalated Now"        color="var(--color-escalated)" live />
        <StatCard value={`${stats.avg_escalation_time_minutes ?? 0} min`} label="Avg. Escalation Time" trend={{ pct: stats.trend?.avg_escalation_time_minutes, positiveIsGood: false, compareLabel }} />
        <StatCard value={stats.resolved_today ?? 0}        label="Resolved"             color="var(--color-resolved)" trend={{ pct: stats.trend?.resolved_today, compareLabel }} />
        <StatCard value={`${stats.resolution_rate ?? 0}%`} label="Resolution Rate" trend={{ pct: stats.trend?.resolution_rate, compareLabel }} />
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No escalated reports</td></tr>
              ) : data.map(row => (
                <tr key={row.report_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48, borderLeft: '3px solid #DC2626' }}>
                  <td style={{ padding: '0 12px' }}><span className="mono" style={{ fontSize: 12, color: '#0F1117' }}>RPT-{row.report_id}</span></td>
                  <td style={{ padding: '0 12px' }}><PlateBadge plate={row.plate_number} /></td>
                  <td style={{ padding: '0 12px', fontSize: 13, color: '#0F1117' }}>{row.street_name ?? '-'}</td>
                  <td style={{ padding: '0 12px' }}><PenaltyTierBadge tier_name={row.tier_name} /></td>
                  <td style={{ padding: '0 12px', fontSize: 12, color: '#0F1117' }}>
                    {row.submitted_at ? new Date(row.submitted_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 12, color: '#0F1117' }}>
                    {row.escalated_at ? new Date(row.escalated_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td style={{ padding: '0 12px' }}><Elapsed escalatedAt={row.escalated_at} /></td>
                  <td style={{ padding: '0 12px' }}>
                    <button onClick={() => openModal(row)}
                      style={{ padding: '4px 14px', borderRadius: 6, background: '#DC2626', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', height: 28 }}>
                      Handle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Handle Modal */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px 0' }}>
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 600, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', padding: 28, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Escalated Report RPT-{modal.report_id}</h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              {[['details', 'View Details'], ['assign', 'Assign to Officer'], ['resolve', 'Resolve Directly']].map(([t, label]) => (
                <button key={t} onClick={() => { setModalTab(t); setFieldErr('') }}
                  style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 600, background: modalTab === t ? 'var(--accent)' : 'transparent', color: modalTab === t ? '#fff' : 'var(--color-text-secondary)', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>

            {modalTab === 'details' && (
              <div>
                {detailLoading ? (
                  <div style={{ padding: 32, textAlign: 'center' }}><LoadingSpinner size={24} /></div>
                ) : !detailReport ? (
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center', padding: 32 }}>Could not load report details.</div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <PlateBadge plate={detailReport.vehicle?.plate_number} large />
                      <PenaltyTierBadge tier_name={detailReport.penalty_tier?.tier_name} />
                      <StatusBadge status={detailReport.status} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                      <KV label="Barangay">{detailReport.street?.barangay_name ?? '-'}</KV>
                      <KV label="Street">{detailReport.street?.street_name ?? '-'}</KV>
                      <KV label="Violation">{detailReport.violation_type ?? '-'}</KV>
                      <KV label="Fine">PHP {detailReport.penalty_tier?.fine_amount != null ? Number(detailReport.penalty_tier.fine_amount).toLocaleString() : '-'}</KV>
                      <KV label="Submitted">{detailReport.submitted_at ? new Date(detailReport.submitted_at).toLocaleString('en-PH') : '-'}</KV>
                      <KV label="Escalated At">{detailReport.escalated_at ? new Date(detailReport.escalated_at).toLocaleString('en-PH') : '-'}</KV>
                      <KV label="Escalation Reason">{detailReport.escalation_reason ?? '-'}</KV>
                      <KV label="Reporter">{detailReport.reporter?.anonymous_alias ?? '-'}</KV>
                    </div>
                    {detailReport.photo_url && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Photo Evidence</div>
                        <img src={detailReport.photo_url} alt="Evidence" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)' }} />
                      </div>
                    )}
                    {detailReport.additional_photos?.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Additional Photos ({detailReport.additional_photos.length})</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {detailReport.additional_photos.map((url, i) => (
                            <img key={i} src={url} alt={`Additional ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border)' }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {(detailReport.vehicle?.history ?? []).filter(h => h.report_id !== detailReport.report_id).length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Prior Violations</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                              {['Barangay', 'Street', 'Tier', 'Status'].map(h => (
                                <th key={h} style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detailReport.vehicle.history.filter(h => h.report_id !== detailReport.report_id).map(h => (
                              <tr key={h.report_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <td style={{ padding: '4px 6px' }}>{h.barangay_name ?? '-'}</td>
                                <td style={{ padding: '4px 6px' }}>{h.street_name ?? '-'}</td>
                                <td style={{ padding: '4px 6px' }}>{h.penalty_tier?.tier_name ?? '-'}</td>
                                <td style={{ padding: '4px 6px' }}><StatusBadge status={h.status} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {modalTab === 'assign' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                  Select Officer
                </label>
                <select value={selectedOfficer} onChange={e => setSelectedOfficer(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)', marginBottom: 4 }}>
                  <option value="">- Select officer -</option>
                  {officers.map(o => (
                    <option key={o.user_id} value={o.user_id}>
                      {o.first_name} {o.last_name} - Badge #{o.badge_number ?? '-'}
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
                  {['Ticket Issued', 'Wheel Clamp', 'Vehicle Impounded', 'Vehicle No Longer Present'].map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 48, border: `${resolveOutcome === opt ? 2 : 1}px solid ${resolveOutcome === opt ? 'var(--accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: resolveOutcome === opt ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer' }}>
                      <input type="radio" name="sv_outcome" value={opt} checked={resolveOutcome === opt} onChange={() => { setResolveOutcome(opt); setFieldErr('') }} style={{ accentColor: 'var(--accent)' }} />
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{opt}</span>
                    </label>
                  ))}
                </div>
                {(resolveOutcome === 'Ticket Issued' || resolveOutcome === 'Wheel Clamp' || resolveOutcome === 'Vehicle Impounded') && (
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
