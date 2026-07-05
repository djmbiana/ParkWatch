import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { adminGroups, adminPermissions, adminUsers } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

const MODULES = [
  { key: 'users_mgt',     label: 'User Management',  funcs: ['edit_profile', 'reset_password', 'status_update'] },
  { key: 'brgy_mgt',      label: 'Barangay Mgmt',    funcs: ['manage'] },
  { key: 'streets_rules', label: 'Streets & Rules',   funcs: ['manage'] },
  { key: 'penalty',       label: 'Penalty Tiers',     funcs: ['manage'] },
  { key: 'audit',         label: 'Audit Log',         funcs: ['manage'] },
  { key: 'reports',       label: 'Reports',           funcs: ['manage'] },
]
const ACTIONS = ['create', 'read', 'update', 'delete']

export default function AdminUserGroups() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const { group: myGroup } = usePermissions()
  const isSuperAdmin = !!myGroup?.is_system_role

  const [groups, setGroups]       = useState([])
  const [perms, setPerms]         = useState([])   // all permission definitions
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [matrix, setMatrix]       = useState({})   // { permId: { can_create, can_read, ... } }
  const [loading, setLoading]     = useState(true)
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [saveLoading, setSaveLoading]     = useState(false)

  const [showAdd, setShowAdd]     = useState(false)
  const [newGroup, setNewGroup]   = useState({ name: '', description: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showAssign, setShowAssign] = useState(false)
  const [allUsers, setAllUsers]     = useState([])
  const [assignUserId, setAssignUserId] = useState('')
  const [assignGroupId, setAssignGroupId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)

  useEffect(() => { setPageTitle('User Groups') }, [setPageTitle])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [g, p] = await Promise.all([adminGroups.list(), adminPermissions.list()])
      setGroups(Array.isArray(g) ? g : [])
      setPerms(Array.isArray(p) ? p : [])
    } catch { /* errors toasted by api.js */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const loadMatrix = useCallback(async (groupId) => {
    setMatrixLoading(true)
    try {
      const data = await adminGroups.getPermissions(groupId)
      const rows = data?.matrix ?? (Array.isArray(data) ? data : [])
      const m = {}
      for (const row of rows) {
        m[row.permission_id] = { can_create: !!row.can_create, can_read: !!row.can_read, can_update: !!row.can_update, can_delete: !!row.can_delete }
      }
      setMatrix(m)
    } catch { setMatrix({}) }
    finally { setMatrixLoading(false) }
  }, [])

  const selectGroup = (g) => {
    setSelectedGroup(g)
    loadMatrix(g.id)
  }

  const toggleFlag = (permId, action) => {
    setMatrix(prev => ({
      ...prev,
      [permId]: { ...(prev[permId] ?? { can_create: false, can_read: false, can_update: false, can_delete: false }), [`can_${action}`]: !(prev[permId]?.[`can_${action}`]) },
    }))
  }

  const handleSaveMatrix = async () => {
    if (!selectedGroup) return
    setSaveLoading(true)
    try {
      const rows = Object.entries(matrix).map(([permId, flags]) => ({
        permission_id: parseInt(permId), ...flags,
      }))
      await adminGroups.updatePermissions(selectedGroup.id, rows)
      toast('Permissions saved.', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setSaveLoading(false) }
  }

  const handleAddGroup = async () => {
    if (!newGroup.name.trim()) { toast('Group name required.', 'error'); return }
    setAddLoading(true)
    try {
      await adminGroups.create({ name: newGroup.name.trim(), description: newGroup.description.trim() })
      toast(`"${newGroup.name}" created.`, 'success')
      setShowAdd(false)
      setNewGroup({ name: '', description: '' })
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setAddLoading(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await adminGroups.delete(deleteTarget.id)
      toast(`"${deleteTarget.name}" deleted.`, 'success')
      setDeleteTarget(null)
      if (selectedGroup?.id === deleteTarget.id) setSelectedGroup(null)
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setDeleteLoading(false) }
  }

  const openAssign = async () => {
    try {
      const data = await adminUsers.list()
      setAllUsers(Array.isArray(data) ? data : (data?.users ?? []))
    } catch { setAllUsers([]) }
    setAssignUserId('')
    setAssignGroupId('')
    setShowAssign(true)
  }

  const handleAssign = async () => {
    if (!assignUserId || !assignGroupId) { toast('Select a user and a group.', 'error'); return }
    setAssignLoading(true)
    try {
      await adminGroups.assignUserGroup(assignUserId, assignGroupId)
      toast('User group updated.', 'success')
      setShowAssign(false)
    } catch (e) { toast(e.message, 'error') }
    finally { setAssignLoading(false) }
  }

  // Helper: find permission ID from matrix columns
  const permId = (mod, func) => perms.find(p => p.module_name === mod && p.function_name === func)?.id

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><LoadingSpinner size={28} /></div>

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%', overflow: 'hidden' }}>
      {/* Left: group list */}
      <div style={{ width: 260, flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Groups</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={openAssign}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>
              Assign
            </button>
            {isSuperAdmin && (
              <button onClick={() => { setNewGroup({ name: '', description: '' }); setShowAdd(true) }}
                style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                + New
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {groups.map(g => (
            <div key={g.id} onClick={() => selectGroup(g)}
              style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', background: selectedGroup?.id === g.id ? 'var(--color-bg)' : 'transparent', borderLeft: selectedGroup?.id === g.id ? '3px solid var(--accent)' : '3px solid transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {g.user_count ?? 0} {g.user_count === 1 ? 'user' : 'users'}
                    {g.is_system_role ? ' · System' : ''}
                  </div>
                </div>
                {isSuperAdmin && !g.is_system_role && (
                  <button onClick={e => { e.stopPropagation(); setDeleteTarget(g) }}
                    style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>
                    &times;
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: permission matrix */}
      <div style={{ flex: 1, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedGroup ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
            Select a group to view or edit its permissions
          </div>
        ) : matrixLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingSpinner size={24} /></div>
        ) : (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedGroup.name}</div>
                {selectedGroup.description && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{selectedGroup.description}</div>
                )}
              </div>
              {isSuperAdmin && (
                <button onClick={handleSaveMatrix} disabled={saveLoading}
                  style={{ padding: '7px 18px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {saveLoading && <LoadingSpinner size={13} color="#fff" />} Save
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Module / Function</th>
                    {ACTIONS.map(a => (
                      <th key={a} style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', width: 72 }}>{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map(mod => mod.funcs.map((func, fi) => {
                    const pid = permId(mod.key, func)
                    const flags = matrix[pid] ?? {}
                    return (
                      <tr key={`${mod.key}-${func}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          {fi === 0 && (
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: mod.funcs.length > 1 ? 2 : 0 }}>
                              {mod.label}
                            </span>
                          )}
                          {mod.funcs.length > 1 && (
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{func.replace('_', ' ')}</span>
                          )}
                        </td>
                        {ACTIONS.map(action => (
                          <td key={action} style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {pid != null && (
                              <button
                                onClick={() => isSuperAdmin && toggleFlag(pid, action)}
                                style={{
                                  width: 22, height: 22, borderRadius: 4,
                                  border: `1.5px solid ${flags[`can_${action}`] ? 'var(--accent)' : 'var(--color-border)'}`,
                                  background: flags[`can_${action}`] ? 'var(--accent)' : 'transparent',
                                  cursor: isSuperAdmin ? 'pointer' : 'default',
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#fff', fontSize: 12, fontWeight: 700,
                                }}
                              >
                                {flags[`can_${action}`] ? '✓' : ''}
                              </button>
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  }))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add group modal */}
      {showAdd && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '90vw', padding: 28, boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>New User Group</h2>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Group Name *</label>
            <input value={newGroup.name} onChange={e => setNewGroup(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Report Reviewer"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)', marginBottom: 14 }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Description</label>
            <input value={newGroup.description} onChange={e => setNewGroup(p => ({ ...p, description: e.target.value }))} placeholder="Optional"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddGroup} disabled={addLoading} style={{ padding: '8px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {addLoading && <LoadingSpinner size={13} color="#fff" />} Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign user to group modal */}
      {showAssign && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowAssign(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '90vw', padding: 28, boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Assign User to Group</h2>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>User</label>
            <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', marginBottom: 14 }}>
              <option value="">- Select user -</option>
              {allUsers.filter(u => u.role !== 'citizen').map(u => (
                <option key={u.user_id} value={u.user_id}>{u.first_name} {u.last_name} ({u.email})</option>
              ))}
            </select>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Group</label>
            <select value={assignGroupId} onChange={e => setAssignGroupId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }}>
              <option value="">- Select group -</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAssign(false)} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAssign} disabled={assignLoading} style={{ padding: '8px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {assignLoading && <LoadingSpinner size={13} color="#fff" />} Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          message="Users in this group will have their group cleared. This cannot be undone."
          confirmLabel="Delete Group"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
