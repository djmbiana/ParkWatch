'use strict'
import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { adminStreets } from '../../services/api'
import { getStoredUser } from '../../utils/auth'

const VIOLATION_TYPES = [
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

export default function BarangayStreets() {
  const { setPageTitle } = useOutletContext()
  const user = getStoredUser()
  const barangayId = user?.barangay_id

  const [streets, setStreets]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [expanded, setExpanded]         = useState(null)
  const [showAddStreet, setShowAddStreet] = useState(false)
  const [newStreetName, setNewStreetName] = useState('')
  const [addingStreet, setAddingStreet]   = useState(false)
  const [streetError, setStreetError]     = useState('')
  const [addRuleFor, setAddRuleFor]       = useState(null)
  const [newViolation, setNewViolation]   = useState(VIOLATION_TYPES[0])
  const [saving, setSaving]               = useState(false)

  useEffect(() => { setPageTitle('My Barangay Streets') }, [setPageTitle])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminStreets.list()
      setStreets(Array.isArray(data) ? data : [])
    } catch {
      setStreets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAddStreet = async () => {
    if (!newStreetName.trim()) return
    setAddingStreet(true)
    setStreetError('')
    try {
      await adminStreets.create({ street_name: newStreetName.trim(), barangay_id: barangayId })
      setNewStreetName('')
      setShowAddStreet(false)
      await load()
    } catch (e) {
      setStreetError(e.message)
    } finally {
      setAddingStreet(false)
    }
  }

  const handleDeactivate = async (streetId, streetName) => {
    if (!window.confirm(`Deactivate "${streetName}"? Citizens will no longer be able to report violations on this street.`)) return
    try {
      await adminStreets.deactivate(streetId)
      if (expanded === streetId) setExpanded(null)
      await load()
    } catch {}
  }

  const handleAddRule = async (streetId) => {
    setSaving(true)
    try {
      await adminStreets.createRule({ street_id: streetId, violation_type: newViolation })
      setAddRuleFor(null)
      setNewViolation(VIOLATION_TYPES[0])
      await load()
    } catch {} finally {
      setSaving(false)
    }
  }

  const handleToggleRule = async (ruleId) => {
    try {
      await adminStreets.toggleRule(ruleId)
      await load()
    } catch {}
  }

  const card = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  }

  const headerRow = {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 18px',
    gap: 12,
    cursor: 'pointer',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--color-text-secondary)', fontSize: 14 }}>
        Loading streets...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>Streets</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {streets.length} street{streets.length !== 1 ? 's' : ''} in your barangay
          </p>
        </div>
        <button
          onClick={() => { setShowAddStreet(true); setStreetError('') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} /> Add Street
        </button>
      </div>

      {/* Add Street inline form */}
      {showAddStreet && (
        <div style={{ ...card, padding: 16, marginBottom: 16, background: '#f8fdf9', border: '1px solid var(--accent)' }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>New Street</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Street name"
              value={newStreetName}
              onChange={e => setNewStreetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddStreet()}
              autoFocus
              style={{
                flex: 1, minWidth: 200,
                padding: '8px 12px', fontSize: 13,
                border: '1px solid var(--color-border)', borderRadius: 7,
                background: '#fff', color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleAddStreet}
              disabled={addingStreet || !newStreetName.trim()}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 600,
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 7, cursor: 'pointer',
                opacity: addingStreet || !newStreetName.trim() ? 0.6 : 1,
              }}
            >
              {addingStreet ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAddStreet(false); setNewStreetName(''); setStreetError('') }}
              style={{
                padding: '8px 14px', fontSize: 13,
                background: 'transparent', color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)', borderRadius: 7, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
          {streetError && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-escalated)' }}>{streetError}</p>
          )}
        </div>
      )}

      {/* Streets list */}
      {streets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-secondary)', fontSize: 14 }}>
          No streets yet. Add your first street above.
        </div>
      ) : (
        streets.map(street => {
          const isExpanded = expanded === street.street_id
          const activeRules = (street.rules ?? []).filter(r => r.is_active)
          const inactiveRules = (street.rules ?? []).filter(r => !r.is_active)

          return (
            <div key={street.street_id} style={card}>
              {/* Street row */}
              <div
                style={headerRow}
                onClick={() => setExpanded(isExpanded ? null : street.street_id)}
              >
                {/* Expand icon */}
                <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>

                {/* Street name */}
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {street.street_name}
                </span>

                {/* Status */}
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                  background: street.is_active ? '#d1fae5' : '#fee2e2',
                  color: street.is_active ? '#065f46' : '#991b1b',
                  letterSpacing: '0.04em',
                }}>
                  {street.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>

                {/* Rule count */}
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 80, textAlign: 'right' }}>
                  {activeRules.length} active rule{activeRules.length !== 1 ? 's' : ''}
                </span>

                {/* Deactivate — stop propagation so click doesn't expand */}
                {street.is_active && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDeactivate(street.street_id, street.street_name) }}
                    title="Deactivate street"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', fontSize: 12, fontWeight: 500,
                      background: 'transparent', color: '#dc2626',
                      border: '1px solid #fecaca', borderRadius: 6,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <Trash2 size={13} /> Deactivate
                  </button>
                )}
              </div>

              {/* Expanded rules */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px 18px 16px' }}>

                  {/* Active rules */}
                  {activeRules.length > 0 && (
                    <div style={{ marginBottom: inactiveRules.length > 0 ? 12 : 0 }}>
                      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Active Rules
                      </p>
                      {activeRules.map(rule => (
                        <RuleRow key={rule.rule_id} rule={rule} onToggle={handleToggleRule} />
                      ))}
                    </div>
                  )}

                  {/* Inactive rules */}
                  {inactiveRules.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Inactive Rules
                      </p>
                      {inactiveRules.map(rule => (
                        <RuleRow key={rule.rule_id} rule={rule} onToggle={handleToggleRule} />
                      ))}
                    </div>
                  )}

                  {activeRules.length === 0 && inactiveRules.length === 0 && (
                    <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      No rules added yet.
                    </p>
                  )}

                  {/* Add rule */}
                  {street.is_active && (
                    addRuleFor === street.street_id ? (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select
                          value={newViolation}
                          onChange={e => setNewViolation(e.target.value)}
                          style={{
                            flex: 1, minWidth: 200, padding: '7px 10px', fontSize: 13,
                            border: '1px solid var(--color-border)', borderRadius: 7,
                            background: '#fff', color: 'var(--color-text-primary)',
                          }}
                        >
                          {VIOLATION_TYPES.filter(vt => !(street.rules ?? []).some(r => r.violation_type === vt)).map(vt => (
                            <option key={vt} value={vt}>{vt}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAddRule(street.street_id)}
                          disabled={saving}
                          style={{
                            padding: '7px 16px', fontSize: 13, fontWeight: 600,
                            background: 'var(--accent)', color: '#fff',
                            border: 'none', borderRadius: 7, cursor: 'pointer',
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          {saving ? 'Adding...' : 'Add Rule'}
                        </button>
                        <button
                          onClick={() => setAddRuleFor(null)}
                          style={{
                            padding: '7px 12px', fontSize: 13,
                            background: 'transparent', color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border)', borderRadius: 7, cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddRuleFor(street.street_id); setNewViolation(VIOLATION_TYPES[0]) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, marginTop: 8,
                          padding: '6px 12px', fontSize: 12, fontWeight: 600,
                          background: 'transparent', color: 'var(--accent)',
                          border: '1px solid var(--accent)', borderRadius: 6, cursor: 'pointer',
                        }}
                      >
                        <Plus size={13} /> Add Rule
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function RuleRow({ rule, onToggle }) {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try { await onToggle(rule.rule_id) }
    finally { setBusy(false) }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0', borderBottom: '1px solid var(--color-border)',
      gap: 12,
    }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', flex: 1 }}>
        {rule.violation_type}
      </span>
      <button
        onClick={toggle}
        disabled={busy}
        style={{
          padding: '4px 12px', fontSize: 12, fontWeight: 600,
          background: rule.is_active ? '#f3f4f6' : 'var(--accent)',
          color: rule.is_active ? '#374151' : '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: 6, cursor: 'pointer',
          opacity: busy ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        {rule.is_active ? 'Disable' : 'Enable'}
      </button>
    </div>
  )
}
