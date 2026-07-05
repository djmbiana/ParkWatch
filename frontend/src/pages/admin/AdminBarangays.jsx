import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { adminBarangays } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import StatCard from '../../components/StatCard'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingSpinner from '../../components/LoadingSpinner'
import BarangayLocationPicker from '../../components/BarangayLocationPicker'

export default function AdminBarangays() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission('brgy_mgt', 'manage', 'create')
  const canUpdate = hasPermission('brgy_mgt', 'manage', 'update')
  const [barangays, setBarangays] = useState([])
  const [loading, setLoading] = useState(true)
  const [disableTarget, setDisableTarget] = useState(null)
  const [disableLoading, setDisableLoading] = useState(false)
  const [toggleLoading, setToggleLoading] = useState({})
  const [locationTarget, setLocationTarget] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newBrgy, setNewBrgy] = useState({ barangay_name: '', barangay_number: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [addErr, setAddErr] = useState('')

  useEffect(() => { setPageTitle('Barangay Management') }, [setPageTitle])

  const fetchAll = useCallback(() => {
    return adminBarangays.list().then(data => {
      setBarangays(Array.isArray(data) ? data : (data?.barangays ?? []))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleEnable = async (b) => {
    setToggleLoading(p => ({ ...p, [b.barangay_id]: true }))
    try {
      await adminBarangays.toggle(b.barangay_id)
      toast(`${b.barangay_name} enabled.`, 'success')
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setToggleLoading(p => ({ ...p, [b.barangay_id]: false })) }
  }

  const handleDisable = async () => {
    setDisableLoading(true)
    try {
      await adminBarangays.toggle(disableTarget.barangay_id)
      toast(`${disableTarget.barangay_name} disabled.`, 'success')
      setDisableTarget(null)
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setDisableLoading(false) }
  }

  const handleAdd = async () => {
    const name = newBrgy.barangay_name.trim()
    if (!name) { setAddErr('Barangay name is required.'); return }
    setAddLoading(true); setAddErr('')
    try {
      await adminBarangays.create({ barangay_name: name, barangay_number: newBrgy.barangay_number.trim() })
      toast(`${name} added.`, 'success')
      setShowAdd(false)
      setNewBrgy({ barangay_name: '', barangay_number: '' })
      fetchAll()
    } catch (e) { setAddErr(e.message || 'Could not add barangay.') }
    finally { setAddLoading(false) }
  }

  const total = barangays.length
  const active = barangays.filter(b => b.is_active).length
  const inactive = total - active

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          Toggle pilot enrollment · streets only visible to citizens when barangay is active
        </p>
        {canCreate && (
          <button onClick={() => { setNewBrgy({ barangay_name: '', barangay_number: '' }); setAddErr(''); setShowAdd(true) }}
            style={{ padding: '7px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add Barangay
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={active}   label="Participating Barangays"     color="var(--color-resolved)" />
        <StatCard value={inactive} label="Non-Participating"            color="var(--color-rejected)" />
        <StatCard value={total}    label="Total in Malate" />
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><LoadingSpinner size={28} /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                {['Barangay', 'No.', 'Assigned Official', 'Streets Enrolled', 'Reports (Month)', 'Map Pin', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {barangays.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No barangays found</td></tr>
              ) : barangays.map(b => (
                <tr key={b.barangay_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 500 }}>{b.barangay_name}</td>
                  <td style={{ padding: '0 12px' }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{b.barangay_number ?? '-'}</span>
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {b.assigned_official ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>- (unassigned)</span>}
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 13 }}>{b.streets_enrolled ?? 0}</td>
                  <td style={{ padding: '0 12px', fontSize: 13 }}>{b.reports_this_month ?? 0}</td>
                  <td style={{ padding: '0 12px' }}>
                    {canUpdate && (
                      <button onClick={() => setLocationTarget(b)}
                        style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: b.latitude != null ? 'var(--color-resolved)' : 'var(--accent)', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28, whiteSpace: 'nowrap' }}>
                        {b.latitude != null ? 'Edit pin' : 'Set pin'}
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '0 12px' }}>
                    {b.is_active
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', textTransform: 'uppercase' }}>Active</span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', textTransform: 'uppercase' }}>Inactive</span>
                    }
                  </td>
                  <td style={{ padding: '0 12px' }}>
                    {canUpdate && (b.is_active ? (
                      <button onClick={() => setDisableTarget(b)}
                        style={{ padding: '4px 14px', borderRadius: 6, background: '#EF4444', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28 }}>
                        Disable
                      </button>
                    ) : (
                      <button onClick={() => handleEnable(b)} disabled={toggleLoading[b.barangay_id]}
                        style={{ padding: '4px 14px', borderRadius: 6, background: '#10B981', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: toggleLoading[b.barangay_id] ? 0.7 : 1 }}>
                        {toggleLoading[b.barangay_id] && <LoadingSpinner size={11} color="#fff" />} Enable
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {disableTarget && (
        <ConfirmModal
          title={`Disable ${disableTarget.barangay_name}?`}
          message="Streets in this barangay will no longer be visible to citizens for reporting."
          confirmLabel="Disable Barangay"
          confirmVariant="danger"
          loading={disableLoading}
          onConfirm={handleDisable}
          onCancel={() => setDisableTarget(null)}
        />
      )}

      {locationTarget && (
        <BarangayLocationPicker
          barangay={locationTarget}
          onClose={() => setLocationTarget(null)}
          onSaved={() => { setLocationTarget(null); fetchAll() }}
        />
      )}

      {showAdd && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 440, maxWidth: '90vw', padding: 28, boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Add Barangay</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 18 }}>
              Onboards a barangay to the pilot. After adding, provision its official (Users),
              add its streets (Streets), and set its map pin.
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Barangay Name *</label>
            <input value={newBrgy.barangay_name} onChange={e => { setNewBrgy(p => ({ ...p, barangay_name: e.target.value })); setAddErr('') }}
              placeholder="e.g. Barangay 728"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${addErr ? '#EF4444' : 'var(--color-border)'}`, fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)', marginBottom: 14 }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Number (optional)</label>
            <input value={newBrgy.barangay_number} onChange={e => setNewBrgy(p => ({ ...p, barangay_number: e.target.value }))}
              placeholder="e.g. 728"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
            {addErr && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{addErr}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd} disabled={addLoading} style={{ padding: '8px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {addLoading && <LoadingSpinner size={13} color="#fff" />} Add Barangay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
