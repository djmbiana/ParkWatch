import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { reports } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import { getStoredUser } from '../../utils/auth'
import StatusBadge from '../../components/StatusBadge'
import PlateBadge from '../../components/PlateBadge'
import PenaltyTierBadge from '../../components/PenaltyTierBadge'
import RepeatOffenderBadge from '../../components/RepeatOffenderBadge'
import LoadingSpinner from '../../components/LoadingSpinner'

// Enforcement actions by offense tier (migration 022). "Vehicle No Longer Present"
// means nothing to enforce. Only the paperwork outcomes require a reference number.
const RESOLUTION_OUTCOMES = ['Verbal Warning', 'Ticket Issued', 'Wheel Clamp', 'Vehicle Impounded', 'Vehicle No Longer Present']
const TICKET_REQUIRED_OUTCOMES = ['Ticket Issued', 'Wheel Clamp', 'Vehicle Impounded']

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, marginTop: 20 }}>
      {children}
    </div>
  )
}

function KV({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{children}</div>
    </div>
  )
}

export default function OfficerReportDetail() {
  const { reportId } = useParams()
  const navigate = useNavigate()
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const user = getStoredUser()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState(false)
  const [showResolve, setShowResolve] = useState(false)
  const [resolveOutcome, setResolveOutcome] = useState('')
  const [ticketRef, setTicketRef] = useState('')
  const [ticketErr, setTicketErr] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => { setPageTitle(`Report RPT-${reportId}`) }, [reportId, setPageTitle])

  useEffect(() => {
    reports.getById(reportId).then(setReport).catch(() => toast('Failed to load report.', 'error'))
      .finally(() => setLoading(false))
  }, [reportId])

  const refresh = () => reports.getById(reportId).then(setReport).catch(() => {})

  const doAction = async (action) => {
    setActionLoading(true)
    try {
      if (action === 'acknowledge') await reports.acknowledge(reportId)
      else if (action === 'dispatch') await reports.dispatch(reportId)
      toast(`Report ${action}d.`, 'success')
      await refresh()
    } catch (e) { toast(e.message, 'error') }
    finally { setActionLoading(false) }
  }

  const handleResolve = async () => {
    if (!resolveOutcome) { setTicketErr('Select a resolution outcome.'); return }
    if (TICKET_REQUIRED_OUTCOMES.includes(resolveOutcome) && !ticketRef.trim()) {
      setTicketErr('Reference number is required.'); return
    }
    setTicketErr('')
    setActionLoading(true)
    try {
      await reports.resolve(reportId, { resolution_outcome: resolveOutcome, ticket_reference: ticketRef.trim() || undefined })
      toast('Report resolved.', 'success')
      navigate('/mtpb/officer/queue')
    } catch (e) { toast(e.message, 'error') }
    finally { setActionLoading(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingSpinner size={28} /></div>
  if (!report) return <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--color-text-muted)' }}>Report not found.</div>

  const isMyReport = report.assigned_officer_id === user?.user_id || report.assigned_officer_id === user?.id
  const history = (report.vehicle?.history ?? []).filter(h => h.report_id !== report.report_id)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/mtpb/officer/queue')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ color: 'var(--color-border-strong)' }}>|</span>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Report RPT-{report.report_id}</span>
        <StatusBadge status={report.status} />
        {report.vehicle?.is_repeat_offender && <RepeatOffenderBadge />}
      </div>

      <div className="portal-split" style={{ display: 'flex', gap: 20 }}>
        {/* Left */}
        <div className="portal-col" style={{ flex: '0 0 50%' }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <PlateBadge plate={report.vehicle?.plate_number} large />
              <PenaltyTierBadge tier_name={report.penalty_tier?.tier_name} />
            </div>
            <KV label="Street">{report.street?.street_name ?? '-'}</KV>
            <KV label="Violation">{report.violation_type ?? '-'}</KV>
            <KV label="Submitted">{report.submitted_at ? new Date(report.submitted_at).toLocaleString('en-PH') : '-'}</KV>
            <KV label="Penalty">PHP {report.penalty_tier?.fine_amount != null ? Number(report.penalty_tier.fine_amount).toLocaleString() : '-'}</KV>
            <KV label="Reporter">{report.reporter?.anonymous_alias ?? '-'}</KV>

            {report.photo_url && (
              <>
                <SectionHeader>Photo Evidence</SectionHeader>
                <div onClick={() => setLightbox(true)} style={{ border: '2px dashed #CBD5E1', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#F8FAFC' }}>
                  <img src={report.photo_url} alt="Evidence" style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
                </div>
              </>
            )}
            {report.additional_photos?.length > 0 && (
              <>
                <SectionHeader>Additional Photos ({report.additional_photos.length})</SectionHeader>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {report.additional_photos.map((url, i) => (
                    <img key={i} src={url} alt={`Additional evidence ${i + 1}`} onClick={() => setLightbox(url)}
                      style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)', cursor: 'pointer' }} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="portal-col" style={{ flex: '0 0 50%' }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 20, marginBottom: 16 }}>
            <SectionHeader>Cross-Barangay Violation History</SectionHeader>
            {history.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No prior violations.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                    {['Barangay', 'Street', 'Tier', 'Status'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.report_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px' }}>{h.barangay_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{h.street_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{h.penalty_tier?.tier_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}><StatusBadge status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 20 }}>
            <SectionHeader>Enforcement Actions</SectionHeader>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {report.status === 'verified' && (
                <button onClick={() => doAction('acknowledge')} disabled={actionLoading} style={actionBtn('#3B82F6')}>
                  {actionLoading ? <LoadingSpinner size={13} color="#fff" /> : 'Acknowledge'}
                </button>
              )}
              {report.status === 'acknowledged' && isMyReport && (
                <button onClick={() => doAction('dispatch')} disabled={actionLoading} style={actionBtn('#D97706')}>
                  {actionLoading ? <LoadingSpinner size={13} color="#fff" /> : 'Dispatch'}
                </button>
              )}
              {report.status === 'dispatched' && isMyReport && (
                <button onClick={() => setShowResolve(v => !v)} style={actionBtn('#10B981')}>
                  Resolve
                </button>
              )}
            </div>

            {showResolve && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {RESOLUTION_OUTCOMES.map(opt => (
                    <label key={opt} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', height: 44,
                      border: `${resolveOutcome === opt ? 2 : 1}px solid ${resolveOutcome === opt ? 'var(--accent)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-md)', background: resolveOutcome === opt ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer',
                    }}>
                      <input type="radio" name="res_outcome" value={opt} checked={resolveOutcome === opt} onChange={() => { setResolveOutcome(opt); setTicketErr('') }} style={{ accentColor: 'var(--accent)' }} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{opt}</span>
                    </label>
                  ))}
                </div>
                {TICKET_REQUIRED_OUTCOMES.includes(resolveOutcome) && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                      Reference No. *
                    </label>
                    <input type="text" value={ticketRef} onChange={e => setTicketRef(e.target.value)} placeholder="e.g. TKT-2025-0034"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: ticketErr ? '1.5px solid #EF4444' : '1px solid var(--color-border)', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
                  </div>
                )}
                {ticketErr && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{ticketErr}</div>}
                <button onClick={handleResolve} disabled={actionLoading} style={{ ...actionBtn('var(--accent)'), width: '100%', justifyContent: 'center' }}>
                  {actionLoading ? <LoadingSpinner size={13} color="#fff" /> : 'Confirm Resolution'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'zoom-out' }}>
          <img src={typeof lightbox === 'string' ? lightbox : report.photo_url} alt="Evidence full" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

function actionBtn(bg) {
  return {
    padding: '8px 20px', borderRadius: 6, background: bg, color: '#fff', border: 'none',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  }
}
