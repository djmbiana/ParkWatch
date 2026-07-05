import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { adminTiers } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import LoadingSpinner from '../../components/LoadingSpinner'

const BLANK = { tier_name: '', min_violations: '', max_violations: '', fine_amount: '', requires_clamping: false }

export default function AdminPenaltyTiers() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission('penalty', 'manage', 'create')
  const canUpdate = hasPermission('penalty', 'manage', 'update')
  const [tiers, setTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState({})
  const [editValues, setEditValues] = useState({})
  const [saveLoading, setSaveLoading] = useState({})
  const [errors, setErrors] = useState({})
  const [addingNew, setAddingNew] = useState(false)
  const [newTier, setNewTier] = useState(BLANK)
  const [newErr, setNewErr] = useState({})
  const [addLoading, setAddLoading] = useState(false)

  useEffect(() => { setPageTitle('Penalty Tier Configuration') }, [setPageTitle])

  const fetchAll = useCallback(() => {
    return adminTiers.list().then(data => {
      setTiers(Array.isArray(data) ? data : (data?.tiers ?? []))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const validateOverlap = (tierList, excludeId = null) => {
    const sorted = tierList
      .filter(t => t.tier_id !== excludeId)
      .map(t => ({ ...t, min: Number(t.min_violations ?? 0), max: t.max_violations != null ? Number(t.max_violations) : Infinity }))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].min <= sorted[j].max && sorted[j].min <= sorted[i].max) {
          return `Overlap detected between "${sorted[i].tier_name}" and "${sorted[j].tier_name}"`
        }
      }
    }
    return null
  }

  const startEdit = (t) => {
    setEditing(p => ({ ...p, [t.tier_id]: true }))
    setEditValues(p => ({ ...p, [t.tier_id]: { ...t } }))
    setErrors(p => ({ ...p, [t.tier_id]: '' }))
  }

  const cancelEdit = (id) => {
    setEditing(p => ({ ...p, [id]: false }))
    setErrors(p => ({ ...p, [id]: '' }))
  }

  const saveEdit = async (id) => {
    const vals = editValues[id]
    const testList = tiers.map(t => t.tier_id === id ? { ...vals } : t)
    const overlap = validateOverlap(testList, id)
    if (overlap) { setErrors(p => ({ ...p, [id]: overlap })); return }

    setSaveLoading(p => ({ ...p, [id]: true }))
    try {
      await adminTiers.update(id, {
        tier_name: vals.tier_name,
        min_violations: Number(vals.min_violations),
        max_violations: vals.max_violations === '' || vals.max_violations == null ? null : Number(vals.max_violations),
        fine_amount: Number(vals.fine_amount),
        requires_clamping: !!vals.requires_clamping,
      })
      toast('Tier updated.', 'success')
      setEditing(p => ({ ...p, [id]: false }))
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaveLoading(p => ({ ...p, [id]: false })) }
  }

  const handleAddNew = async () => {
    const err = {}
    if (!newTier.tier_name.trim()) err.tier_name = 'Required'
    if (newTier.min_violations === '') err.min_violations = 'Required'
    if (newTier.fine_amount === '') err.fine_amount = 'Required'
    if (Object.keys(err).length) { setNewErr(err); return }

    const testList = [...tiers, { ...newTier, tier_id: -1 }]
    const overlap = validateOverlap(testList, -1)
    if (overlap) { setNewErr({ _overlap: overlap }); return }

    setAddLoading(true)
    try {
      await adminTiers.create({
        tier_name: newTier.tier_name,
        min_violations: Number(newTier.min_violations),
        max_violations: newTier.max_violations === '' ? null : Number(newTier.max_violations),
        fine_amount: Number(newTier.fine_amount),
        requires_clamping: !!newTier.requires_clamping,
      })
      toast('Tier added.', 'success')
      setAddingNew(false)
      setNewTier(BLANK)
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setAddLoading(false) }
  }

  const isThirdPlus = (t) => {
    const lower = (t.tier_name ?? '').toLowerCase()
    return lower.includes('3rd') || lower.includes('third') || lower.includes('3+')
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 16 }}>
        Fine amounts and clamping rules per offense level
      </p>

      {/* Warning banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
        <TriangleAlert size={16} color="#D97706" />
        <span style={{ fontSize: 13, color: '#92400E' }}>
          Changes apply to new reports only. Existing reports retain the tier assigned at submission time.
        </span>
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><LoadingSpinner size={28} /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                {['Tier Name', 'Min Violations', 'Max Violations', 'Fine Amount (PHP)', 'Clamping Required', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map(t => {
                const isEdit = editing[t.tier_id]
                const vals = editValues[t.tier_id] ?? t
                const rowBg = isThirdPlus(t) ? '#FFF5F5' : 'transparent'
                return (
                  <tr key={t.tier_id} style={{ borderBottom: '1px solid var(--color-border)', height: 52, background: rowBg }}>
                    <td style={{ padding: '0 16px' }}>
                      {isEdit ? (
                        <input value={vals.tier_name} onChange={e => setEditValues(p => ({ ...p, [t.tier_id]: { ...vals, tier_name: e.target.value } }))}
                          style={editInput} />
                      ) : <span style={{ fontSize: 13, fontWeight: 500 }}>{t.tier_name}</span>}
                    </td>
                    <td style={{ padding: '0 16px' }}>
                      {isEdit ? (
                        <input type="number" value={vals.min_violations} onChange={e => setEditValues(p => ({ ...p, [t.tier_id]: { ...vals, min_violations: e.target.value } }))}
                          style={{ ...editInput, width: 72 }} />
                      ) : <span style={{ fontSize: 13 }}>{t.min_violations}</span>}
                    </td>
                    <td style={{ padding: '0 16px' }}>
                      {isEdit ? (
                        <input type="number" value={vals.max_violations ?? ''} placeholder="No limit" onChange={e => setEditValues(p => ({ ...p, [t.tier_id]: { ...vals, max_violations: e.target.value } }))}
                          style={{ ...editInput, width: 80, fontStyle: vals.max_violations == null || vals.max_violations === '' ? 'italic' : 'normal' }} />
                      ) : <span style={{ fontSize: 13, color: t.max_violations == null ? 'var(--color-text-muted)' : 'inherit', fontStyle: t.max_violations == null ? 'italic' : 'normal' }}>
                        {t.max_violations ?? 'No limit'}
                      </span>}
                    </td>
                    <td style={{ padding: '0 16px' }}>
                      {isEdit ? (
                        <input type="number" value={vals.fine_amount} onChange={e => setEditValues(p => ({ ...p, [t.tier_id]: { ...vals, fine_amount: e.target.value } }))}
                          style={{ ...editInput, width: 100 }} />
                      ) : <span style={{ fontSize: 13 }}>PHP {Number(t.fine_amount).toLocaleString()}</span>}
                    </td>
                    <td style={{ padding: '0 16px' }}>
                      {isEdit ? (
                        <button onClick={() => setEditValues(p => ({ ...p, [t.tier_id]: { ...vals, requires_clamping: !vals.requires_clamping } }))}
                          style={{
                            padding: '3px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                            background: vals.requires_clamping ? '#ECFDF5' : '#FEF2F2',
                            color: vals.requires_clamping ? '#059669' : '#DC2626',
                          }}>
                          {vals.requires_clamping ? 'YES' : 'NO'}
                        </button>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: t.requires_clamping ? '#ECFDF5' : '#FEF2F2', color: t.requires_clamping ? '#059669' : '#DC2626' }}>
                          {t.requires_clamping ? 'YES' : 'NO'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0 16px' }}>
                      {isEdit ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => saveEdit(t.tier_id)} disabled={saveLoading[t.tier_id]}
                            style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {saveLoading[t.tier_id] && <LoadingSpinner size={11} color="#fff" />} Save
                          </button>
                          <button onClick={() => cancelEdit(t.tier_id)}
                            style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontSize: 12, cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      ) : canUpdate ? (
                        <button onClick={() => startEdit(t)}
                          style={{ padding: '4px 14px', borderRadius: 6, background: '#0F1117', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28 }}>
                          Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}

              {/* New tier row */}
              {addingNew && (
                <tr style={{ borderBottom: '1px solid var(--color-border)', height: 52, background: '#F8F9FB' }}>
                  <td style={{ padding: '0 16px' }}>
                    <input value={newTier.tier_name} onChange={e => setNewTier(p => ({ ...p, tier_name: e.target.value }))}
                      placeholder="Tier name" style={{ ...editInput, borderColor: newErr.tier_name ? '#EF4444' : undefined }} />
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <input type="number" value={newTier.min_violations} onChange={e => setNewTier(p => ({ ...p, min_violations: e.target.value }))}
                      placeholder="0" style={{ ...editInput, width: 72 }} />
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <input type="number" value={newTier.max_violations} onChange={e => setNewTier(p => ({ ...p, max_violations: e.target.value }))}
                      placeholder="No limit" style={{ ...editInput, width: 80 }} />
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <input type="number" value={newTier.fine_amount} onChange={e => setNewTier(p => ({ ...p, fine_amount: e.target.value }))}
                      placeholder="0" style={{ ...editInput, width: 100, borderColor: newErr.fine_amount ? '#EF4444' : undefined }} />
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <button onClick={() => setNewTier(p => ({ ...p, requires_clamping: !p.requires_clamping }))}
                      style={{ padding: '3px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: newTier.requires_clamping ? '#ECFDF5' : '#FEF2F2', color: newTier.requires_clamping ? '#059669' : '#DC2626' }}>
                      {newTier.requires_clamping ? 'YES' : 'NO'}
                    </button>
                  </td>
                  <td style={{ padding: '0 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleAddNew} disabled={addLoading}
                        style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {addLoading && <LoadingSpinner size={11} color="#fff" />} Add
                      </button>
                      <button onClick={() => { setAddingNew(false); setNewTier(BLANK); setNewErr({}) }}
                        style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontSize: 12, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Inline overlap errors */}
        {Object.entries(errors).map(([id, msg]) => msg ? (
          <div key={id} style={{ padding: '8px 16px', background: '#FEF2F2', borderTop: '1px solid #FECACA', fontSize: 12, color: '#DC2626' }}>{msg}</div>
        ) : null)}
        {newErr._overlap && (
          <div style={{ padding: '8px 16px', background: '#FEF2F2', borderTop: '1px solid #FECACA', fontSize: 12, color: '#DC2626' }}>{newErr._overlap}</div>
        )}

        {canCreate && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--color-border)' }}>
            <button onClick={() => { setAddingNew(true); setNewTier(BLANK); setNewErr({}) }}
              style={{ padding: '7px 16px', borderRadius: 6, background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Add Tier
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const editInput = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)',
  fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)',
  width: '100%',
}
