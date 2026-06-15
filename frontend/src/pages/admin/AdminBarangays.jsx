import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { adminBarangays } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import StatCard from '../../components/StatCard'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function AdminBarangays() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const [barangays, setBarangays] = useState([])
  const [loading, setLoading] = useState(true)
  const [disableTarget, setDisableTarget] = useState(null)
  const [disableLoading, setDisableLoading] = useState(false)
  const [toggleLoading, setToggleLoading] = useState({})

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

  const total = barangays.length
  const active = barangays.filter(b => b.is_active).length
  const inactive = total - active

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16, marginTop: 0 }}>
        Toggle pilot enrollment · streets only visible to citizens when barangay is active
      </p>

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
                {['Barangay', 'No.', 'Assigned Official', 'Streets Enrolled', 'Reports (Month)', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {barangays.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No barangays found</td></tr>
              ) : barangays.map(b => (
                <tr key={b.barangay_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 500 }}>{b.barangay_name}</td>
                  <td style={{ padding: '0 12px' }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{b.barangay_number ?? '—'}</span>
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {b.assigned_official ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>— (unassigned)</span>}
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 13 }}>{b.streets_enrolled ?? 0}</td>
                  <td style={{ padding: '0 12px', fontSize: 13 }}>{b.reports_this_month ?? 0}</td>
                  <td style={{ padding: '0 12px' }}>
                    {b.is_active
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', textTransform: 'uppercase' }}>✓ Active</span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', textTransform: 'uppercase' }}>✗ Inactive</span>
                    }
                  </td>
                  <td style={{ padding: '0 12px' }}>
                    {b.is_active ? (
                      <button onClick={() => setDisableTarget(b)}
                        style={{ padding: '4px 14px', borderRadius: 6, background: '#EF4444', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28 }}>
                        Disable
                      </button>
                    ) : (
                      <button onClick={() => handleEnable(b)} disabled={toggleLoading[b.barangay_id]}
                        style={{ padding: '4px 14px', borderRadius: 6, background: '#10B981', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: toggleLoading[b.barangay_id] ? 0.7 : 1 }}>
                        {toggleLoading[b.barangay_id] && <LoadingSpinner size={11} color="#fff" />} Enable
                      </button>
                    )}
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
    </div>
  )
}
