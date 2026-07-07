import { useEffect, useState, useCallback, useRef, forwardRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Search, Plus, Pencil, Check, X } from 'lucide-react'
import { adminStreets, adminBarangays } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import LoadingSpinner from '../../components/LoadingSpinner'

const COMMON_VIOLATIONS = [
  'Parked on Sidewalk',
  'Parked on Pedestrian Lane',
  'Parked on Yellow Line',
  'Parked in No Parking Zone',
  'Double Parking',
  'Blocking Driveway or Entrance',
  'Wrong Side Parking',
  'Parked at Intersection or Corner',
  'Parked in Front of Fire Hydrant',
  'Parked in Bus or Jeepney Stop Zone',
]

export default function AdminStreets() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission('streets_rules', 'manage', 'create')
  const canUpdate = hasPermission('streets_rules', 'manage', 'update')

  const [streets, setStreets]             = useState([])
  const [barangays, setBarangays]         = useState([])
  const [selected, setSelected]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [streetSearch, setStreetSearch]   = useState('')
  const [showAddStreet, setShowAddStreet] = useState(false)
  const [newStreet, setNewStreet]         = useState({ street_name: '', barangay_id: '' })
  const [streetErr, setStreetErr]         = useState({})
  const [addStreetLoading, setAddStreetLoading] = useState(false)
  const [newViolation, setNewViolation]   = useState('')
  const [addRuleLoading, setAddRuleLoading] = useState(false)
  const [toggleLoading, setToggleLoading] = useState({})
  // inline edit state: { ruleId, field, value }
  const [editing, setEditing]             = useState(null)
  const [editSaving, setEditSaving]       = useState(false)
  const editRef = useRef(null)

  useEffect(() => { setPageTitle('Streets & Parking Rules') }, [setPageTitle])

  const fetchAll = useCallback(() => {
    return Promise.all([
      adminStreets.list().catch(() => []),
      adminBarangays.list().catch(() => []),
    ]).then(([s, b]) => {
      const streetArr = Array.isArray(s) ? s : (s?.streets ?? [])
      setStreets(streetArr)
      setBarangays(Array.isArray(b) ? b : (b?.barangays ?? []))
      if (selected) {
        const updated = streetArr.find(st => st.street_id === selected.street_id)
        if (updated) setSelected(updated)
      }
    }).finally(() => setLoading(false))
  }, [selected?.street_id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredStreets = streets.filter(s =>
    s.street_name?.toLowerCase().includes(streetSearch.toLowerCase()) ||
    s.barangay_name?.toLowerCase().includes(streetSearch.toLowerCase())
  )

  const handleAddStreet = async () => {
    const err = {}
    if (!newStreet.street_name.trim()) err.street_name = 'Required'
    if (!newStreet.barangay_id) err.barangay_id = 'Required'
    if (Object.keys(err).length) { setStreetErr(err); return }
    setAddStreetLoading(true)
    try {
      await adminStreets.create(newStreet)
      toast('Street added.', 'success')
      setShowAddStreet(false)
      setNewStreet({ street_name: '', barangay_id: '' })
      setStreetErr({})
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setAddStreetLoading(false) }
  }

  const handleToggleRule = async (rule) => {
    setToggleLoading(p => ({ ...p, [rule.rule_id]: true }))
    try {
      await adminStreets.toggleRule(rule.rule_id)
      toast(`Rule ${rule.is_active ? 'disabled' : 'enabled'}.`, 'success')
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setToggleLoading(p => ({ ...p, [rule.rule_id]: false })) }
  }

  const handleAddRule = async () => {
    if (!newViolation.trim()) { toast('Enter a violation type.', 'error'); return }
    if (!selected) return
    setAddRuleLoading(true)
    try {
      await adminStreets.createRule({ street_id: selected.street_id, violation_type: newViolation.trim() })
      toast('Parking rule added.', 'success')
      setNewViolation('')
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setAddRuleLoading(false) }
  }

  const startEdit = (ruleId, field, currentValue) => {
    setEditing({ ruleId, field, value: currentValue ?? '' })
    setTimeout(() => editRef.current?.focus(), 0)
  }

  const cancelEdit = () => setEditing(null)

  const saveEdit = async () => {
    if (!editing) return
    setEditSaving(true)
    try {
      await adminStreets.updateRule(editing.ruleId, { [editing.field]: editing.value })
      toast('Updated.', 'success')
      setEditing(null)
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setEditSaving(false) }
  }

  const COLS = ['Violation Type', 'Violation Description', 'Ordinance', 'Status', 'Action']

  return (
    <div className="portal-split" style={{ display: 'flex', gap: 16, height: 'calc(100vh - 56px - 48px)', overflow: 'hidden' }}>

      {/* ── Left panel: street list ── */}
      <div className="portal-col" style={{ flex: '0 0 34%', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input value={streetSearch} onChange={e => setStreetSearch(e.target.value)} placeholder="Search streets…"
              style={{ width: '100%', padding: '6px 8px 6px 26px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-bg)' }} />
          </div>
          {canCreate && (
            <button onClick={() => setShowAddStreet(v => !v)}
              style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={13} /> Add
            </button>
          )}
        </div>

        {showAddStreet && (
          <div style={{ padding: '12px 16px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
            <input value={newStreet.street_name}
              onChange={e => { setNewStreet(p => ({ ...p, street_name: e.target.value })); setStreetErr(p => ({ ...p, street_name: '' })) }}
              placeholder="Street name *"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${streetErr.street_name ? '#EF4444' : 'var(--color-border)'}`, fontSize: 12, marginBottom: 6, background: 'var(--color-surface)' }} />
            <select value={newStreet.barangay_id}
              onChange={e => { setNewStreet(p => ({ ...p, barangay_id: e.target.value })); setStreetErr(p => ({ ...p, barangay_id: '' })) }}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${streetErr.barangay_id ? '#EF4444' : 'var(--color-border)'}`, fontSize: 12, marginBottom: 8, background: 'var(--color-surface)' }}>
              <option value="">- Select barangay -</option>
              {barangays.map(b => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
            </select>
            <button onClick={handleAddStreet} disabled={addStreetLoading}
              style={{ width: '100%', padding: '7px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {addStreetLoading && <LoadingSpinner size={12} color="#fff" />} Add Street
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}><LoadingSpinner size={20} /></div>
          ) : filteredStreets.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No streets found</div>
          ) : filteredStreets.map(s => {
            const isSelected = selected?.street_id === s.street_id
            const ruleCount = s.rules?.filter(r => r.is_active)?.length ?? s.active_rule_count ?? 0
            return (
              <div key={s.street_id} onClick={() => setSelected(s)}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--color-border)',
                  background: isSelected ? 'var(--accent-soft)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: isSelected ? 'var(--accent)' : 'var(--color-text-primary)' }}>{s.street_name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {s.barangay_name ?? '-'} · {ruleCount} active rule{ruleCount !== 1 ? 's' : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Right panel: rules table ── */}
      <div className="portal-col" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Select a street to manage its parking rules</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {selected.street_name} - Parking Rules
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{selected.barangay_name}</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                    {COLS.map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(selected.rules ?? []).length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No rules defined for this street.</td></tr>
                  ) : (selected.rules ?? []).map(rule => (
                    <tr key={rule.rule_id} style={{ borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' }}>

                      {/* Violation Type */}
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {rule.violation_type}
                      </td>

                      {/* Violation Description — inline editable */}
                      <td style={{ padding: '10px 14px' }}>
                        {canUpdate && editing?.ruleId === rule.rule_id && editing.field === 'description' ? (
                          <EditCell
                            ref={editRef}
                            value={editing.value}
                            onChange={v => setEditing(e => ({ ...e, value: v }))}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                            saving={editSaving}
                          />
                        ) : (
                          <EditableCell
                            value={rule.description}
                            placeholder="Add description…"
                            canEdit={canUpdate}
                            onEdit={() => startEdit(rule.rule_id, 'description', rule.description)}
                          />
                        )}
                      </td>

                      {/* Ordinance — inline editable */}
                      <td style={{ padding: '10px 14px' }}>
                        {canUpdate && editing?.ruleId === rule.rule_id && editing.field === 'ordinance' ? (
                          <EditCell
                            ref={editRef}
                            value={editing.value}
                            onChange={v => setEditing(e => ({ ...e, value: v }))}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                            saving={editSaving}
                          />
                        ) : (
                          <EditableCell
                            value={rule.ordinance}
                            placeholder="Add ordinance…"
                            canEdit={canUpdate}
                            onEdit={() => startEdit(rule.rule_id, 'ordinance', rule.ordinance)}
                          />
                        )}
                      </td>

                      {/* Status toggle */}
                      <td style={{ padding: '12px 14px' }}>
                        {canUpdate ? (
                          <button onClick={() => handleToggleRule(rule)} disabled={toggleLoading[rule.rule_id]}
                            title={rule.is_active ? 'Click to disable' : 'Click to enable'}
                            style={{
                              width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer',
                              background: rule.is_active ? '#10B981' : '#D1D5DB',
                              position: 'relative', transition: 'background 0.2s',
                              opacity: toggleLoading[rule.rule_id] ? 0.6 : 1, flexShrink: 0,
                            }}>
                            <span style={{
                              position: 'absolute', top: 3,
                              left: rule.is_active ? 20 : 3,
                              width: 16, height: 16, borderRadius: '50%',
                              background: '#fff', transition: 'left 0.2s',
                            }} />
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 600, color: rule.is_active ? '#059669' : '#DC2626' }}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>

                      {/* Action: Enable (green) / Disable (red) */}
                      <td style={{ padding: '12px 14px' }}>
                        {canUpdate && (
                          <button onClick={() => handleToggleRule(rule)} disabled={toggleLoading[rule.rule_id]}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600,
                              fontSize: 13, padding: 0,
                              color: rule.is_active ? '#DC2626' : '#059669',
                              opacity: toggleLoading[rule.rule_id] ? 0.5 : 1,
                            }}>
                            {rule.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add rule footer */}
            {canCreate && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <select value={newViolation} onChange={e => setNewViolation(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }}>
                  <option value="">- Select violation type -</option>
                  {COMMON_VIOLATIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <input value={newViolation} onChange={e => setNewViolation(e.target.value)} placeholder="Or type custom…"
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }} />
                <button onClick={handleAddRule} disabled={addRuleLoading || !newViolation.trim()}
                  style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: (!newViolation.trim() || addRuleLoading) ? 0.6 : 1, flexShrink: 0 }}>
                  {addRuleLoading && <LoadingSpinner size={13} color="#fff" />} Add Rule
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Read-only cell with a pencil-edit trigger.
function EditableCell({ value, placeholder, canEdit, onEdit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minHeight: 24 }}>
      <span style={{ fontSize: 12, color: value ? 'var(--color-text-primary)' : 'var(--color-text-muted)', flex: 1, lineHeight: 1.5 }}>
        {value || placeholder}
      </span>
      {canEdit && (
        <button onClick={onEdit} title="Edit"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '1px 2px', flexShrink: 0, opacity: 0.6 }}>
          <Pencil size={12} />
        </button>
      )}
    </div>
  )
}

// Active inline textarea with save / cancel.
const EditCell = forwardRef(function EditCell({ value, onChange, onSave, onCancel, saving }, ref) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave() ; if (e.key === 'Escape') onCancel() }}
        rows={2}
        style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--accent)', resize: 'vertical', width: '100%', background: 'var(--color-surface)' }}
      />
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onSave} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', fontSize: 11, fontWeight: 600, background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {saving ? <LoadingSpinner size={10} color="#fff" /> : <Check size={10} />} Save
        </button>
        <button onClick={onCancel} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', fontSize: 11, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer' }}>
          <X size={10} /> Cancel
        </button>
      </div>
    </div>
  )
})
