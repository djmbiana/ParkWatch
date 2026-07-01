import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft, ChevronLeft } from 'lucide-react'
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
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{children}</span>
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, marginTop: 20 }}>
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
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectErr, setRejectErr] = useState('')
  const [rejectLoading, setRejectLoading] = useState(false)

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

  const handleReject = async () => {
    if (!rejectReason.trim() || rejectReason.trim().length < 10) {
      setRejectErr('Reason must be at least 10 characters.')
      return
    }
    setRejectErr('')
    setRejectLoading(true)
    try {
      await reports.verify(reportId, { action: 'reject', rejection_reason: rejectReason.trim() })
      toast('Report rejected.', 'success')
      navigate('/barangay/queue')
    } catch (e) {
      toast(e.message || 'Failed to reject report.', 'error')
    } finally {
      setRejectLoading(false)
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

  const plate = report.vehicle?.plate_number ?? report.ocr_extracted_plate
  const isPending = report.status === 'pending'
  const history = report.vehicle?.history ?? []
  const otherHistory = history.filter(h => h.report_id !== report.report_id)

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
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Report RPT-{report.report_id}
        </span>
        <StatusBadge status={report.status} />
        {report.vehicle?.is_repeat_offender && <RepeatOffenderBadge />}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* LEFT */}
        <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', gap: 16 }}>
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

            {report.additional_photos?.length > 0 && (
              <>
                <SectionHeader>Additional Photos ({report.additional_photos.length})</SectionHeader>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                  {report.additional_photos.map((url, i) => (
                    <img key={i} src={url} alt={`Additional evidence ${i + 1}`} onClick={() => setLightbox(url)}
                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)', cursor: 'pointer' }} />
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
        <div style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    - PHP {Number(report.penalty_tier.fine_amount).toLocaleString()}
                  </span>
                )}
              </span>
            </KV>
          </div>

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
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {otherHistory.map(h => (
                    <tr key={h.report_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px' }}>{h.barangay_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{h.street_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{h.submitted_at ? new Date(h.submitted_at).toLocaleDateString('en-PH') : '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{h.penalty_tier?.tier_name ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}><StatusBadge status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Actions */}
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
                  onClick={() => { setShowReject(v => !v); setRejectErr('') }}
                  style={{
                    flex: 1, height: 36, borderRadius: 6,
                    background: 'transparent', color: '#EF4444',
                    border: '1.5px solid #EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Reject Report
                </button>
              </div>

              {showReject && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                    Reason for Rejection *
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="Describe why this report is being rejected…"
                    style={{
                      width: '100%', borderRadius: 6,
                      border: rejectErr ? '1.5px solid #EF4444' : '1px solid var(--color-border)',
                      padding: '8px 12px', fontSize: 13,
                      color: 'var(--color-text-primary)',
                      background: 'var(--color-bg)',
                      resize: 'vertical', fontFamily: 'Inter, sans-serif',
                    }}
                  />
                  {rejectErr && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{rejectErr}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
                    <button
                      onClick={handleReject}
                      disabled={rejectLoading}
                      style={{
                        padding: '7px 20px', borderRadius: 6,
                        background: '#EF4444', color: '#fff',
                        border: 'none', fontSize: 13, fontWeight: 600,
                        cursor: rejectLoading ? 'not-allowed' : 'pointer',
                        opacity: rejectLoading ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      {rejectLoading && <LoadingSpinner size={13} color="#fff" />}
                      Confirm Rejection
                    </button>
                    <button
                      onClick={() => { setShowReject(false); setRejectReason(''); setRejectErr('') }}
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

      {/* Lightbox */}
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
            src={typeof lightbox === 'string' ? lightbox : report.photo_url}
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
