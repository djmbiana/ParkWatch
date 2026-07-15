import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Search, Copy, Check } from 'lucide-react'
import { adminUsers, adminBarangays, adminGroups } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import StatCard from '../../components/StatCard'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingSpinner from '../../components/LoadingSpinner'
import useMediaQuery from '../../hooks/useMediaQuery'

const ROLE_LABELS = {
  brgy_official:   'Brgy. Official',
  mtpb_officer:    'MTPB Officer',
  mtpb_supervisor: 'MTPB Supervisor',
  admin:           'Admin',
}

const ROLE_COLORS = {
  brgy_official:   { color: '#2563EB', bg: '#EFF6FF' },
  mtpb_officer:    { color: '#D97706', bg: '#FFFBEB' },
  mtpb_supervisor: { color: '#7C3AED', bg: '#F5F3FF' },
  admin:           { color: '#4F46E5', bg: '#EEF2FF' },
}

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] ?? { color: '#6B7280', bg: '#F3F4F6' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function StatusPill({ user }) {
  if (!user.is_verified) return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', textTransform: 'uppercase' }}>Unverified</span>
  if (!user.is_active) return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', textTransform: 'uppercase' }}>Inactive</span>
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', textTransform: 'uppercase' }}>Active</span>
}

const BLANK_FORM = { first_name: '', last_name: '', email: '', role: 'brgy_official', barangay_id: '', supervisor_id: '', group_id: '' }

export default function AdminUsers() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const { hasPermission, group: myGroup } = usePermissions()
  const canCreate  = hasPermission('users_mgt', 'edit_profile', 'create')
  const canEdit    = hasPermission('users_mgt', 'edit_profile', 'update')
  const canStatus  = hasPermission('users_mgt', 'status_update', 'update')
  // Role and group assignment hit Super-Admin-only routes (PATCH .../role, .../group) —
  // hide those controls for lower-privileged editors so they don't 403 on save.
  const isSuperAdmin = !!myGroup?.is_system_role
  const [users, setUsers] = useState([])
  const [barangays, setBarangays] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showProvision, setShowProvision] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)
  const [formErr, setFormErr] = useState({})
  const [formLoading, setFormLoading] = useState(false)
  const [tempPassword, setTempPassword] = useState(null)
  const [copied, setCopied] = useState(false)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  useEffect(() => { setPageTitle('User Management') }, [setPageTitle])

  const fetchAll = useCallback(() => {
    return Promise.all([
      adminUsers.list().catch(() => []),
      adminBarangays.list().catch(() => []),
      isSuperAdmin ? adminGroups.list().catch(() => []) : Promise.resolve([]),
    ]).then(([u, b, g]) => {
      setUsers(Array.isArray(u) ? u : (u?.users ?? []))
      setBarangays(Array.isArray(b) ? b : (b?.barangays ?? []))
      setGroups(Array.isArray(g) ? g : (g?.groups ?? []))
    }).finally(() => setLoading(false))
  }, [isSuperAdmin])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Citizens have no staff account — exclude them from the admin view entirely
  const staffUsers = users.filter(u => u.role !== 'citizen')
  const supervisors = staffUsers.filter(u => u.role === 'mtpb_supervisor' && u.is_active)

  const counts = {
    brgy_official:   staffUsers.filter(u => u.role === 'brgy_official').length,
    mtpb_officer:    staffUsers.filter(u => u.role === 'mtpb_officer').length,
    mtpb_supervisor: staffUsers.filter(u => u.role === 'mtpb_supervisor').length,
    admin:           staffUsers.filter(u => u.role === 'admin').length,
  }

  let filtered = staffUsers
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(u =>
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.employee_id?.toLowerCase().includes(q)
    )
  }
  if (roleFilter !== 'all') filtered = filtered.filter(u => u.role === roleFilter)

  const validate = (f) => {
    const err = {}
    if (!f.first_name.trim()) err.first_name = 'Required'
    if (!f.last_name.trim()) err.last_name = 'Required'
    if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) err.email = 'Valid email required'
    if (f.role === 'brgy_official' && !f.barangay_id) err.barangay_id = 'Required for Barangay Official'
    return err
  }

  const handleProvision = async () => {
    const err = validate(form)
    if (Object.keys(err).length) { setFormErr(err); return }
    setFormLoading(true)
    try {
      const res = await adminUsers.create(form)
      setTempPassword(res.temporary_password ?? res.password ?? 'pw-check-api')
      toast('Account provisioned.', 'success')
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setFormLoading(false) }
  }

  const handleEdit = async () => {
    const err = validate(form)
    if (Object.keys(err).length) { setFormErr(err); return }
    setFormLoading(true)
    try {
      await adminUsers.update(showEdit.user_id, form)
      if (isSuperAdmin && form.role !== showEdit.role) {
        await adminGroups.assignRole(showEdit.user_id, form.role)
      }
      // assignUserGroup requires a non-empty group_id (the backend has no
      // "unassign" path yet) — only call it when a group was actually picked.
      if (isSuperAdmin && form.group_id && String(form.group_id) !== String(showEdit.group_id ?? '')) {
        await adminGroups.assignUserGroup(showEdit.user_id, form.group_id)
      }
      if (form.role === 'mtpb_officer' && String(form.supervisor_id) !== String(showEdit.supervisor_id ?? '')) {
        await adminGroups.assignSupervisor(showEdit.user_id, form.supervisor_id || null)
      }
      toast('User updated.', 'success')
      setShowEdit(null)
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setFormLoading(false) }
  }

  const handleDeactivate = async () => {
    setDeactivateLoading(true)
    try {
      await adminUsers.deactivate(deactivateTarget.user_id)
      toast('User deactivated.', 'success')
      setDeactivateTarget(null)
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setDeactivateLoading(false) }
  }

  const handleReactivate = async (u) => {
    try {
      await adminUsers.reactivate(u.user_id)
      toast('User reactivated.', 'success')
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await adminUsers.delete(deleteTarget.user_id)
      toast('Account permanently deleted.', 'success')
      setDeleteTarget(null)
      fetchAll()
    } catch (e) { toast(e.message, 'error') }
    finally { setDeleteLoading(false) }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const openEdit = (u) => {
    setForm({ first_name: u.first_name ?? '', last_name: u.last_name ?? '', email: u.email ?? '', role: u.role ?? 'brgy_official', barangay_id: u.barangay_id ?? '', supervisor_id: u.supervisor_id ?? '', group_id: u.group_id ?? '' })
    setFormErr({})
    setShowEdit(u)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={counts.brgy_official}   label="Barangay Officials" color="var(--color-verified)" />
        <StatCard value={counts.mtpb_officer}    label="MTPB Officers"      color="var(--color-dispatched)" />
        <StatCard value={counts.mtpb_supervisor} label="Supervisors"        color="var(--color-ack)" />
        <StatCard value={counts.admin}           label="Admins" />
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, employee ID..."
              style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12, background: 'var(--color-surface)' }}>
            <option value="all">All Roles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {canCreate && (
            <button onClick={() => { setForm(BLANK_FORM); setFormErr({}); setTempPassword(null); setShowProvision(true) }}
              style={{ padding: '7px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + Provision Official Account
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><LoadingSpinner size={28} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No users found</div>
        ) : isMobile ? (
          /* --- Mobile: stacked cards (no horizontal scrolling) --- */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
            {filtered.map(u => (
              <UserCard
                key={u.user_id}
                u={u}
                onEdit={openEdit}
                onDeactivate={setDeactivateTarget}
                onReactivate={handleReactivate}
              />
            ))}
          </div>
        ) : (
          /* --- Desktop: table --- */
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                {['Name', 'Role', 'Email', 'Barangay / Badge', 'Status', 'Created', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.user_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 500 }}>{u.first_name} {u.last_name}</td>
                  <td style={{ padding: '0 12px' }}>
                    <RoleBadge role={u.role} />
                    {u.group_name && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>{u.group_name}</div>
                    )}
                  </td>
                  <td style={{ padding: '0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{u.email}</td>
                  <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {u.role === 'brgy_official' ? (u.barangay_name ?? '-')
                     : u.role === 'mtpb_officer' || u.role === 'mtpb_supervisor' ? `Badge #${u.badge_number ?? u.employee_id ?? '-'}`
                     : '-'}
                  </td>
                  <td style={{ padding: '0 12px' }}><StatusPill user={u} /></td>
                  <td style={{ padding: '0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '-'}
                  </td>
                  <td style={{ padding: '0 12px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!!canEdit && (
                        <button onClick={() => openEdit(u)} style={actionBtn('#0F1117')}>Edit</button>
                      )}
                      {!!canStatus && !!u.is_active && (
                        <button onClick={() => setDeactivateTarget(u)} style={actionBtn('#EF4444')}>Deactivate</button>
                      )}
                      {!!canStatus && !u.is_active && (
                        <button onClick={() => handleReactivate(u)} style={actionBtn('#10B981')}>Reactivate</button>
                      )}
                      {!!canStatus && !u.is_active && (
                        <button onClick={() => setDeleteTarget(u)} style={actionBtn('#7F1D1D')}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Provision Modal */}
      {showProvision && (
        <div onClick={e => { if (e.target === e.currentTarget && !tempPassword) setShowProvision(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 500, maxWidth: '90vw', padding: 28, boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Provision Official Account</h2>
            {!tempPassword ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <FormField label="First Name" name="first_name" required form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} />
                  <FormField label="Last Name" name="last_name" required form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} />
                </div>
                <FormField label="Email" name="email" type="email" required form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} />
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Role *</label>
                  <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }}>
                    <option value="brgy_official">Barangay Official</option>
                    <option value="mtpb_officer">MTPB Officer</option>
                    <option value="mtpb_supervisor">MTPB Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {form.role === 'brgy_official' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Barangay *</label>
                    <select value={form.barangay_id} onChange={e => setForm(p => ({ ...p, barangay_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${formErr.barangay_id ? '#EF4444' : 'var(--color-border)'}`, fontSize: 13, background: 'var(--color-bg)' }}>
                      <option value="">- Select barangay -</option>
                      {barangays.map(b => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
                    </select>
                    {formErr.barangay_id && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{formErr.barangay_id}</div>}
                  </div>
                )}
                {isSuperAdmin && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Permission Group</label>
                    <select value={form.group_id} onChange={e => setForm(p => ({ ...p, group_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }}>
                      <option value="">- No group (uses role default) -</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      E.g. a Barangay Official can be assigned the "Barangay Captain" group for expanded permissions.
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button onClick={() => setShowProvision(false)} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleProvision} disabled={formLoading} style={{ padding: '8px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {formLoading && <LoadingSpinner size={13} color="#fff" />} Provision
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div style={{ background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: '#92400E' }}>Share this password securely. It will not be shown again.</span>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Temporary Password</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, padding: '10px 14px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#0F1117', overflowWrap: 'break-word' }}>
                      {tempPassword}
                    </code>
                    <button onClick={handleCopy} style={{ padding: '10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      {copied ? <Check size={16} color="#10B981" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <button onClick={() => setShowProvision(false)} style={{ width: '100%', padding: '10px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowEdit(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-animate" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: 500, maxWidth: '90vw', padding: 28, boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Edit User</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <FormField label="First Name" name="first_name" required form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} />
              <FormField label="Last Name" name="last_name" required form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} />
            </div>
            <FormField label="Email" name="email" type="email" required form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} />
            {isSuperAdmin ? (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Role *</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }}>
                  <option value="brgy_official">Barangay Official</option>
                  <option value="mtpb_officer">MTPB Officer</option>
                  <option value="mtpb_supervisor">MTPB Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Role</label>
                <div style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                  {ROLE_LABELS[form.role] ?? form.role} <span style={{ fontSize: 11 }}>(only a Super Admin can change roles)</span>
                </div>
              </div>
            )}
            {form.role === 'brgy_official' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Barangay</label>
                <select value={form.barangay_id} onChange={e => setForm(p => ({ ...p, barangay_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }}>
                  <option value="">- Select barangay -</option>
                  {barangays.map(b => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
                </select>
              </div>
            )}
            {form.role === 'mtpb_officer' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Assigned Supervisor</label>
                <select value={form.supervisor_id} onChange={e => setForm(p => ({ ...p, supervisor_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }}>
                  <option value="">- Unassigned -</option>
                  {supervisors.map(s => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isSuperAdmin && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Permission Group</label>
                <select value={form.group_id} onChange={e => setForm(p => ({ ...p, group_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)' }}>
                  <option value="">- No group (uses role default) -</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  E.g. a Barangay Official can be assigned the "Barangay Captain" group for expanded permissions.
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button onClick={() => setShowEdit(null)} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleEdit} disabled={formLoading} style={{ padding: '8px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {formLoading && <LoadingSpinner size={13} color="#fff" />} Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {deactivateTarget && (
        <ConfirmModal
          title="Deactivate this user?"
          message={`${deactivateTarget.first_name} ${deactivateTarget.last_name} will lose access to ParkWatch.`}
          confirmLabel="Deactivate"
          confirmVariant="danger"
          loading={deactivateLoading}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Permanently delete this account?"
          message={`This will permanently remove ${deleteTarget.first_name} ${deleteTarget.last_name} (${deleteTarget.email}). This cannot be undone.`}
          confirmLabel="Delete Permanently"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// Defined at module scope (NOT inside AdminUsers) so its component identity is
// stable across re-renders. A component defined inside the parent is recreated
// on every keystroke, which remounts the <input> and drops focus after each
// character typed — the cause of the "one character at a time" bug.
function FormField({ label, name, type = 'text', required, form, setForm, formErr, setFormErr }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
        {label}{required && ' *'}
      </label>
      <input
        type={type}
        value={form[name]}
        onChange={e => {
          const { value } = e.target
          setForm(p => ({ ...p, [name]: value }))
          setFormErr(p => ({ ...p, [name]: '' }))
        }}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${formErr[name] ? '#EF4444' : 'var(--color-border)'}`, fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
      />
      {formErr[name] && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{formErr[name]}</div>}
    </div>
  )
}

function actionBtn(bg) {
  return { padding: '4px 14px', borderRadius: 6, background: bg, color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28 }
}

// Mobile card: one user per card, all fields stacked with labels. Reuses the
// same RoleBadge / StatusPill / action logic as the desktop table so behaviour
// and styling stay in sync.
function UserCard({ u, onEdit, onDeactivate, onReactivate }) {
  const barangayOrBadge =
    u.role === 'brgy_official' ? (u.barangay_name ?? '-')
    : u.role === 'mtpb_officer' || u.role === 'mtpb_supervisor' ? `Badge #${u.badge_number ?? u.employee_id ?? '-'}`
    : '-'
  const created = u.created_at
    ? new Date(u.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '-'

  const Row = ({ label, children }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 24 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'right', wordBreak: 'break-word' }}>{children}</span>
    </div>
  )

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{u.first_name} {u.last_name}</span>
        <div style={{ textAlign: 'right' }}>
          <RoleBadge role={u.role} />
          {u.group_name && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>{u.group_name}</div>
          )}
        </div>
      </div>

      <Row label="Email">{u.email}</Row>
      <Row label="Barangay / Badge">{barangayOrBadge}</Row>
      <Row label="Status"><StatusPill user={u} /></Row>
      <Row label="Created">{created}</Row>

      <div style={{ marginTop: 4 }}>
        {u.role !== 'citizen' && u.is_active ? (
          <button onClick={() => onEdit(u)} style={{ ...actionBtn('#0F1117'), width: '100%', height: 36, fontSize: 13 }}>Edit</button>
        ) : u.is_active ? (
          <button onClick={() => onDeactivate(u)} style={{ ...actionBtn('#EF4444'), width: '100%', height: 36, fontSize: 13 }}>Deactivate</button>
        ) : (
          <button onClick={() => onReactivate(u)} style={{ ...actionBtn('#10B981'), width: '100%', height: 36, fontSize: 13 }}>Reactivate</button>
        )}
      </div>
    </div>
  )
}
