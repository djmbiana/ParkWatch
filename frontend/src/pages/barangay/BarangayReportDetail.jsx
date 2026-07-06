import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { reports } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import StatusBadge from '../../components/StatusBadge'
import PlateBadge from '../../components/PlateBadge'
import PenaltyTierBadge from '../../components/PenaltyTierBadge'
import RepeatOffenderBadge from '../../components/RepeatOffenderBadge'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingSpinner from '../../components/LoadingSpinner'

function KV({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#0F1117' }}>{children}</span>
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, marginTop: 20 }}>
      {children}
    </div>
  )
}

export default function BarangayReportDetail() {
  const { reportId } = useParams()
  const navigate = useNavigate()
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState(false)
  const [slideshowIdx, setSlideshowIdx] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineErr, setDeclineErr] = useState('')
  const [declineLoading, setDeclineLoading] = useState(false)
  const [verdict, setVerdict] = useState('upheld')
  const [verdictNotes, setVerdictNotes] = useState('')
  const [verdictLoading, setVerdictLoading] = useState(false)

  useEffect(() => { setPageTitle(`Report RPT-${reportId}`) }, [reportId, setPageTitle])

  useEffect(() => {
    setLoading(true)
    reports.getById(reportId).then(setReport).catch(() => {
      toast('Failed to load report.', 'error')
    }).finally(() => setLoading(false))
  }, [reportId])

  const handleApprove = async () => {
    setConfirmLoading(true)
    try {
      await reports.verify(reportId, { action: 'approve' })
      toast('Report approved and routed to MTPB queue.', 'success')
      navigate('/barangay/queue')
    } catch (e) {
      toast(e.message || 'Failed to approve report.', 'error')
    } finally {
      setConfirmLoading(false)
      setShowConfirm(false)
    }
  }

  const handleDecline = async () => {
    if (!declineReason.trim() || declineReason.trim().length < 10) {
      setDeclineErr('Please provide a reason of at least 10 characters.')
      return
    }
    setDeclineErr('')
    setDeclineLoading(true)
    try {
      await reports.verify(reportId, { action: 'reject', rejection_reason: declineReason.trim() })
      toast('Report declined.', 'success')
      navigate('/barangay/queue')
    } catch (e) {
      toast(e.message || 'Failed to decline report.', 'error')
    } finally {
      setDeclineLoading(false)
    }
  }

  const handleVerdict = async () => {
    setVerdictLoading(true)
    try {
      await reports.renderAppealVerdict(reportId, verdict, verdictNotes)
      toast(
        verdict === 'overturned'
          ? 'Decision overturned. Report returned to the pending queue.'
          : 'Decision upheld. Citizen has been notified.',
        'success'
      )
      navigate('/barangay/queue')
    } catch (e) {
      toast(e.message || 'Failed to record verdict.', 'error')
    } finally {
      setVerdictLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
        <LoadingSpinner size={28} />
      </div>
    )
  }

  if (!report) {
    return <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', paddingTop: 60 }}>Report not found.</div>
  }

  const isPending = report.status === 'pending'
  const isContested = report.status === 'contested'
  const history = report.vehicle?.history ?? []
  const otherHistory = history.filter(h => h.report_id !== report.report_id)
  const additionalPhotos = Array.isArray(report.additional_photos) ? report.additional_photos : []

  return (
    <div>
      {/* Back + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => navigate('/barangay/queue')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ color: 'var(--color-border-strong)' }}>|</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0F1117' }}>
          Report RPT-{report.report_id}
        </span>
        <StatusBadge status={report.status} />
        {report.vehicle?.is_repeat_offender && <RepeatOffenderBadge />}
      </div>

      <div className="portal-split" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* LEFT */}
        <div className="portal-col" style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            padding: 20,
          }}>
            <SectionHeader>Photo Evidence</SectionHeader>
            <div
              onClick={() => setLightbox(true)}
              style={{
                border: '2px dashed #CBD5E1',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                cursor: 'pointer',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200,
              }}
            >
              {report.photo_url
                ? <img src={report.photo_url} alt="Evidence" style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
                : <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No photo available</span>
              }
            </div>

            {/* Additional photos with inline slideshow */}
            {additionalPhotos.length > 0 && (
              <>
                <SectionHeader>Additional Photos ({additionalPhotos.length})</SectionHeader>

                {slideshowIdx !== null && (
                  <div style={{ marginBottom: 10, borderRadius: 'var(--radius-md)', overflow: 'hidden', position: 'relative', background: '#0F1117' }}>
                    <img
                      src={additionalPhotos[slideshowIdx]}
                      alt={`Evidence ${slideshowIdx + 1}`}
                      style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }}
                    />
                    {additionalPhotos.length > 1 && (
                      <>
                        <button
                          onClick={() => setSlideshowIdx((slideshowIdx - 1 + additionalPhotos.length) % additionalPhotos.length)}
                          style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '6px 8px', display: 'flex' }}
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          onClick={() => setSlideshowIdx((slideshowIdx + 1) % additionalPhotos.length)}
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '6px 8px', display: 'flex' }}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setSlideshowIdx(null)}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer', padding: '4px 8px' }}
                    >
                      Close
                    </button>
                    <div style={{ position: 'absolute', bottom: 8, right: 12, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 4 }}>
                      {slideshowIdx + 1} / {additionalPhotos.length}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                  {additionalPhotos.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Additional evidence ${i + 1}`}
                      onClick={() => setSlideshowIdx(slideshowIdx === i ? null : i)}
                      style={{
                        width: 80, height: 80, objectFit: 'cover', borderRadius: 8,
                        border: slideshowIdx === i ? '2px solid var(--accent)' : '1px solid var(--color-border)',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            <SectionHeader>OCR Extracted Plate</SectionHeader>
            <div style={{ marginBottom: 6 }}>
              <PlateBadge plate={report.ocr_extracted_plate} confidence={report.ocr_confidence_score} large />
            </div>
            {report.ocr_confidence_score != null && (
              <div style={{ fontSize: 12, marginBottom: 8 }}>
                Confidence:{' '}
                <span style={{
                  fontWeight: 600,
                  color: report.ocr_confidence_score >= 90 ? '#10B981'
                       : report.ocr_confidence_score >= 70 ? '#F59E0B'
                       : '#EF4444',
                }}>
                  {report.ocr_confidence_score.toFixed(0)}%
                </span>
              </div>
            )}

            <SectionHeader>Citizen Manual Input</SectionHeader>
            {report.manual_plate_input
              ? <PlateBadge plate={report.manual_plate_input} manual />
              : <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>N/A - OCR result accepted</span>
            }
          </div>
        </div>

        {/* RIGHT */}
        <div className="portal-col" style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Report Details */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            padding: 20,
          }}>
            <SectionHeader>Report Details</SectionHeader>
            <KV label="Submitted">{report.submitted_at ? new Date(report.submitted_at).toLocaleString('en-PH') : '-'}</KV>
            <KV label="Reporter">{report.reporter?.anonymous_alias ?? '-'}</KV>
            <KV label="Street">{report.street?.street_name ?? '-'}</KV>
            <KV label="Barangay">{report.street?.barangay_name ?? '-'}</KV>
            <KV label="Violation">{report.violation_type ?? '-'}</KV>
            <KV label="Penalty Tier">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PenaltyTierBadge tier_name={report.penalty_tier?.tier_name} />
                {report.penalty_tier?.fine_amount != null && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0F1117' }}>
                    PHP {Number(report.penalty_tier.fine_amount).toLocaleString()}
                  </span>
                )}
              </span>
            </KV>
            {report.rejection_reason && (
              <KV label="Reason Declined">{report.rejection_reason}</KV>
            )}
          </div>

          {/* Appeal verdict panel — contested reports only */}
          {isContested && report.appeal && (
            <div style={{
              background: '#F5F3FF',
              border: '1px solid #DDD6FE',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-sm)',
              padding: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Appeal Filed
              </div>
              <p style={{ fontSize: 13, color: '#0F1117', marginBottom: 16, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600 }}>Citizen's reason:</span> {report.appeal.reason}
              </p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <button
                  onClick={() => setVerdict('overturned')}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: verdict === 'overturned' ? '#10B981' : 'transparent',
                    color: verdict === 'overturned' ? '#fff' : '#10B981',
                    border: '1.5px solid #10B981',
                  }}
                >
                  Overturn
                </button>
                <button
                  onClick={() => setVerdict('upheld')}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: verdict === 'upheld' ? '#EF4444' : 'transparent',
                    color: verdict === 'upheld' ? '#fff' : '#EF4444',
                    border: '1.5px solid #EF4444',
                  }}
                >
                  Uphold Decline
                </button>
              </div>
              <textarea
                value={verdictNotes}
                onChange={e => setVerdictNotes(e.target.value)}
                rows={3}
                placeholder="Notes for the citizen (optional)..."
                style={{
                  width: '100%', borderRadius: 6, border: '1px solid #DDD6FE',
                  padding: '8px 12px', fontSize: 13, color: '#0F1117',
                  background: '#fff', resize: 'vertical', fontFamily: 'Inter, sans-serif',
                  marginBottom: 10,
                }}
              />
              {verdict === 'upheld' && (
                <div style={{ fontSize: 12, color: '#6B7280', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
                  The citizen will be advised they may file a Certificate to File Action (CFA) with {report.street?.barangay_name ?? 'the barangay'}.
                </div>
              )}
              <button
                onClick={handleVerdict}
                disabled={verdictLoading}
                style={{
                  padding: '8px 20px', borderRadius: 6,
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: verdictLoading ? 'not-allowed' : 'pointer',
                  opacity: verdictLoading ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {verdictLoading && <LoadingSpinner size={13} color="#fff" />}
                Record Verdict
              </button>
            </div>
          )}

          {/* Cross-Barangay History */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            padding: 20,
          }}>
            <SectionHeader>Cross-Barangay Violation History</SectionHeader>
            {otherHistory.length === 0 ? (
              <div style={{
                background: '#ECFDF5', border: '1px solid #A7F3D0',
                borderRadius: 6, padding: '10px 14px',
                fontSize: 13, color: '#059669',
              }}>
                No prior violations found for this vehicle across all barangays.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                    {['Barangay', 'Street', 'Date', 'Tier', 'Status'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {otherHistory.map(h => (
                    <tr key={h.report_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px', color: '#0F1117', fontWeight: 500 }}>{h.barangay_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px', color: '#0F1117' }}>{h.street_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px', color: '#0F1117' }}>{h.submitted_at ? new Date(h.submitted_at).toLocaleDateString('en-PH') : '-'}</td>
                      <td style={{ padding: '6px 8px', color: '#0F1117' }}>{h.penalty_tier?.tier_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}><StatusBadge status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Actions — pending reports only */}
          {isPending && (
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-sm)',
              padding: 20,
            }}>
              <SectionHeader>Enforcement Action</SectionHeader>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setShowConfirm(true)}
                  style={{
                    flex: 1, height: 36, borderRadius: 6,
                    background: '#10B981', color: '#fff',
                    border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Approve Report
                </button>
                <button
                  onClick={() => { setShowDecline(v => !v); setDeclineErr('') }}
                  style={{
                    flex: 1, height: 36, borderRadius: 6,
                    background: 'transparent', color: '#EF4444',
                    border: '1.5px solid #EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Decline Report
                </button>
              </div>

              {showDecline && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#0F1117', display: 'block', marginBottom: 6 }}>
                    Reason for declining *
                  </label>
                  <textarea
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    rows={3}
                    placeholder="Let the citizen know why this report could not be processed..."
                    style={{
                      width: '100%', borderRadius: 6,
                      border: declineErr ? '1.5px solid #EF4444' : '1px solid var(--color-border)',
                      padding: '8px 12px', fontSize: 13,
                      color: '#0F1117', background: 'var(--color-bg)',
                      resize: 'vertical', fontFamily: 'Inter, sans-serif',
                    }}
                  />
                  {declineErr && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{declineErr}</div>}
                  <p style={{ fontSize: 12, color: '#6B7280', margin: '8px 0 0' }}>
                    The citizen may contest this decision once.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
                    <button
                      onClick={handleDecline}
                      disabled={declineLoading}
                      style={{
                        padding: '7px 20px', borderRadius: 6,
                        background: '#EF4444', color: '#fff',
                        border: 'none', fontSize: 13, fontWeight: 600,
                        cursor: declineLoading ? 'not-allowed' : 'pointer',
                        opacity: declineLoading ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      {declineLoading && <LoadingSpinner size={13} color="#fff" />}
                      Confirm Decision
                    </button>
                    <button
                      onClick={() => { setShowDecline(false); setDeclineReason(''); setDeclineErr('') }}
                      style={{ fontSize: 13, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main photo lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, cursor: 'zoom-out',
          }}
        >
          <img
            src={report.photo_url}
            alt="Evidence full"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Confirm Approve Modal */}
      {showConfirm && (
        <ConfirmModal
          title="Approve this report?"
          message="This will mark the report as Verified and route it to the MTPB enforcement queue."
          confirmLabel="Approve Report"
          confirmVariant="primary"
          loading={confirmLoading}
          onConfirm={handleApprove}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
