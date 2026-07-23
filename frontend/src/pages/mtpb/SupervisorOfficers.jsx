import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { adminUsers } from '../../services/api'
import StatusBadge from '../../components/StatusBadge'
import LoadingSpinner from '../../components/LoadingSpinner'
import { getStoredUser } from '../../utils/auth'
import { useToast } from '../../components/ToastContext'

function KV({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0F1117', fontWeight: 500 }}>{children ?? '-'}</div>
    </div>
  )
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, border: '1px solid var(--color-border)', minWidth: 80 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? '#0F1117' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function SupervisorOfficers() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const me = getStoredUser()
  const [officers, setOfficers] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileModal, setProfileModal] = useState(null)
  const [profileData, setProfileData] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [assigningId, setAssigningId] = useState(null)
  // Revision item 9 — the destructive action is no longer a bare button sitting
  // in the row. It lives behind a per-row menu, then a confirmation naming the
  // officer, so it takes two deliberate clicks instead of one stray one.
  const [menuFor, setMenuFor] = useState(null)      // { officer, top, right }
  const [confirmFor, setConfirmFor] = useState(null) // officer pending removal
  const cancelRef = useRef(null)

  useEffect(() => { setPageTitle('Officers') }, [setPageTitle])

  const fetchOfficers = () => {
    adminUsers.officers()
      .then(data => setOfficers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchOfficers() }, [])

  // Close the row menu on outside click, Escape, or scroll. The menu is
  // position:fixed (the table wrapper clips overflow, so an absolutely
  // positioned dropdown would be cut off on the last row), which means it does
  // not travel with the page — close it rather than let it float loose.
  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuFor])

  // Focus Cancel, not Confirm — the safe option should be the one that catches
  // a stray Enter keypress.
  useEffect(() => {
    if (confirmFor && cancelRef.current) cancelRef.current.focus()
  }, [confirmFor])

  useEffect(() => {
    if (!confirmFor) return
    const onKey = (e) => { if (e.key === 'Escape') setConfirmFor(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmFor])

  const handleClaim = async (officer) => {
    setAssigningId(officer.user_id)
    try {
      await adminUsers.setOfficerSupervisor(officer.user_id, me?.id ?? me?.user_id)
      toast(`${officer.first_name} ${officer.last_name} assigned to your team.`, 'success')
      fetchOfficers()
    } catch (e) { toast(e.message, 'error') }
    finally { setAssigningId(null) }
  }

  const handleRelease = async (officer) => {
    setConfirmFor(null)
    setAssigningId(officer.user_id)
    try {
      await adminUsers.setOfficerSupervisor(officer.user_id, null)
      toast(`${officer.first_name} ${officer.last_name} removed from your team.`, 'success')
      fetchOfficers()
    } catch (e) { toast(e.message, 'error') }
    finally { setAssigningId(null) }
  }

  const openMenu = (e, officer) => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setMenuFor({ officer, top: r.bottom + 4, right: window.innerWidth - r.right })
  }

  const openProfile = (officer) => {
    setProfileModal(officer)
    setProfileData(null)
    setProfileLoading(true)
    adminUsers.officerStats(officer.user_id)
      .then(d => setProfileData(d?.data ?? d))
      .catch(() => {})
      .finally(() => setProfileLoading(false))
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingSpinner size={28} /></div>

  return (
    <div>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', fontSize: 14, fontWeight: 600, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          MTPB Officers
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
              {['Name', 'Badge', 'Email', 'Supervisor', 'Status', 'Active', 'Total Resolved', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {officers.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No officers found</td></tr>
            ) : officers.map(o => (
              <tr key={o.user_id}
                onClick={() => openProfile(o)}
                style={{ borderBottom: '1px solid var(--color-border)', height: 48, cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 600, color: '#0F1117' }}>{o.first_name} {o.last_name}</td>
                <td style={{ padding: '0 12px' }}>
                  <span className="mono" style={{ fontSize: 12, color: '#0F1117' }}>#{o.badge_number ?? '-'}</span>
                </td>
                <td style={{ padding: '0 12px', fontSize: 13, color: '#0F1117' }}>{o.email}</td>
                <td style={{ padding: '0 12px', fontSize: 12, color: '#0F1117' }}>
                  {o.supervisor_name ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Unassigned</span>}
                </td>
                <td style={{ padding: '0 12px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: o.is_active ? '#ECFDF5' : '#FEF2F2', color: o.is_active ? '#059669' : '#DC2626', textTransform: 'uppercase' }}>
                    {o.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '0 12px', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: o.active_reports > 0 ? 'var(--color-dispatched)' : 'var(--color-text-muted)' }}>
                    {o.active_reports ?? 0}
                  </span>
                </td>
                <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 600, color: '#0F1117' }}>
                  {o.resolved_total ?? 0}
                </td>
                <td style={{ padding: '0 12px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                  {o.supervisor_id === (me?.id ?? me?.user_id) ? (
                    // Destructive action moved behind a menu (item 9).
                    <button
                      disabled={assigningId === o.user_id}
                      onClick={(e) => openMenu(e, o)}
                      aria-label={`Actions for ${o.first_name} ${o.last_name}`}
                      aria-haspopup="menu"
                      style={{ padding: '2px 8px', fontSize: 16, lineHeight: 1.2, borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                    >
                      {assigningId === o.user_id ? <LoadingSpinner size={12} /> : '⋮'}
                    </button>
                  ) : !o.supervisor_id ? (
                    // Non-destructive and reversible — stays a direct button.
                    <button
                      disabled={assigningId === o.user_id}
                      onClick={() => handleClaim(o)}
                      style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Assign to me
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Row action menu */}
      {menuFor && (
        <div
          role="menu"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: menuFor.top, right: menuFor.right, zIndex: 1100,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
            padding: 4, minWidth: 190,
          }}
        >
          <button
            role="menuitem"
            onClick={() => { setConfirmFor(menuFor.officer); setMenuFor(null) }}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13,
              background: 'transparent', border: 'none', borderRadius: 6,
              color: '#DC2626', cursor: 'pointer', fontWeight: 500,
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Remove from my team
          </button>
        </div>
      )}

      {/* Removal confirmation */}
      {confirmFor && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setConfirmFor(null) }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-title"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }}
        >
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '94vw', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
            <h2 id="remove-title" style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#0F1117' }}>
              Remove {confirmFor.first_name} {confirmFor.last_name} from your team?
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 6px' }}>
              Badge #{confirmFor.badge_number ?? '-'} will become unassigned. Their account, reports, and
              resolved history are not affected, and you can assign them again at any time.
            </p>
            {confirmFor.active_reports > 0 && (
              <p style={{ fontSize: 13, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 10px', margin: '0 0 6px', lineHeight: 1.5 }}>
                {confirmFor.active_reports} active {confirmFor.active_reports === 1 ? 'report is' : 'reports are'} still
                assigned to this officer. Removing them from your team does not reassign that work.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                ref={cancelRef}
                onClick={() => setConfirmFor(null)}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleRelease(confirmFor)}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer' }}
              >
                Remove from team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Officer Profile Modal */}
      {profileModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setProfileModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px 0' }}>
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 520, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', padding: 28, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0F1117' }}>
                  {profileModal.first_name} {profileModal.last_name}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Badge #{profileModal.badge_number ?? '-'} &nbsp;&middot;&nbsp; {profileModal.email}
                </div>
              </div>
              <button onClick={() => setProfileModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
            </div>

            {profileLoading ? (
              <div style={{ padding: 32, textAlign: 'center' }}><LoadingSpinner size={24} /></div>
            ) : !profileData ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>Could not load officer details.</div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginBottom: 20 }}>
                  <KV label="Supervisor">{profileData.supervisor_name ?? 'Unassigned'}</KV>
                  <KV label="Status">
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: profileData.is_active ? '#ECFDF5' : '#FEF2F2', color: profileData.is_active ? '#059669' : '#DC2626', textTransform: 'uppercase' }}>
                      {profileData.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </KV>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
                  <StatPill label="Active" value={profileData.stats?.active_reports ?? 0} color="var(--color-dispatched)" />
                  <StatPill label="Resolved Total" value={profileData.stats?.resolved_total ?? 0} color="var(--color-resolved)" />
                  <StatPill label="Resolved Today" value={profileData.stats?.resolved_today ?? 0} />
                  <StatPill label="Avg. Resolve" value={profileData.stats?.avg_resolve_min ? `${profileData.stats.avg_resolve_min}m` : '-'} />
                </div>

                {profileData.recent?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                      Recent Reports
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                          {['ID', 'Violation', 'Street', 'Status'].map(h => (
                            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#0F1117', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {profileData.recent.map(r => (
                          <tr key={r.report_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '5px 8px' }}><span className="mono" style={{ fontSize: 11, color: '#0F1117' }}>RPT-{r.report_id}</span></td>
                            <td style={{ padding: '5px 8px', color: '#0F1117' }}>{r.violation_type ?? '-'}</td>
                            <td style={{ padding: '5px 8px', color: '#0F1117' }}>{r.street_name ?? '-'}</td>
                            <td style={{ padding: '5px 8px' }}><StatusBadge status={r.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
