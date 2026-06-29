import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Search, Copy, Check } from 'lucide-react'
import { adminUsers, adminBarangays } from '../../services/api'
import { useToast } from '../../components/ToastContext'
import StatCard from '../../components/StatCard'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingSpinner from '../../components/LoadingSpinner'

const ROLE_LABELS = {
  citizen: 'Citizen',
  brgy_official: 'Brgy. Official',
  mtpb_officer: 'MTPB Officer',
  mtpb_supervisor: 'MTPB Supervisor',
  admin: 'Admin',
}

const ROLE_COLORS = {
  citizen:         { color: '#6B7280', bg: '#F3F4F6' },
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

const BLANK_FORM = { first_name: '', last_name: '', email: '', role: 'brgy_official', barangay_id: '' }

export default function AdminUsers() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [barangays, setBarangays] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showProvision, setShowProvision] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
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
    ]).then(([u, b]) => {
      setUsers(Array.isArray(u) ? u : (u?.users ?? []))
      setBarangays(Array.isArray(b) ? b : (b?.barangays ?? []))
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const counts = {
    citizen:         users.filter(u => u.role === 'citizen').length,
    brgy_official:   users.filter(u => u.role === 'brgy_official').length,
    mtpb_officer:    users.filter(u => u.role === 'mtpb_officer').length,
    mtpb_supervisor: users.filter(u => u.role === 'mtpb_supervisor').length,
  }

  let filtered = users
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

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const openEdit = (u) => {
    setForm({ first_name: u.first_name ?? '', last_name: u.last_name ?? '', email: u.email ?? '', role: u.role ?? 'brgy_official', barangay_id: u.barangay_id ?? '' })
    setFormErr({})
    setShowEdit(u)
  }

  const FormField = ({ label, name, type = 'text', required }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
        {label}{required && ' *'}
      </label>
      <input type={type} value={form[name]} onChange={e => { setForm(p => ({ ...p, [name]: e.target.value })); setFormErr(p => ({ ...p, [name]: '' })) }}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${formErr[name] ? '#EF4444' : 'var(--color-border)'}`, fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
      {formErr[name] && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{formErr[name]}</div>}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard value={counts.citizen}         label="Total Citizens" />
        <StatCard value={counts.brgy_official}   label="Barangay Officials" color="var(--color-verified)" />
        <StatCard value={counts.mtpb_officer}    label="MTPB Officers"      color="var(--color-dispatched)" />
        <StatCard value={counts.mtpb_supervisor} label="Supervisors"        color="var(--color-ack)" />
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
          <button onClick={() => { setForm(BLANK_FORM); setFormErr({}); setTempPassword(null); setShowProvision(true) }}
            style={{ padding: '7px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Provision Official Account
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><LoadingSpinner size={28} /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border-strong)' }}>
                {['Name', 'Role', 'Email', 'Barangay / Badge', 'Status', 'Created', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px 12px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>No users found</td></tr>
              ) : filtered.map(u => (
                <tr key={u.user_id} style={{ borderBottom: '1px solid var(--color-border)', height: 48 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '0 12px', fontSize: 13, fontWeight: 500 }}>{u.first_name} {u.last_name}</td>
                  <td style={{ padding: '0 12px' }}><RoleBadge role={u.role} /></td>
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
                    {u.role !== 'citizen' && u.is_active ? (
                      <button onClick={() => openEdit(u)} style={actionBtn('#0F1117')}>Edit</button>
                    ) : u.is_active ? (
                      <button onClick={() => setDeactivateTarget(u)} style={actionBtn('#EF4444')}>Deactivate</button>
                    ) : (
                      <button onClick={() => handleReactivate(u)} style={actionBtn('#10B981')}>Reactivate</button>
                    )}
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
                  <FormField label="First Name" name="first_name" required />
                  <FormField label="Last Name" name="last_name" required />
                </div>
                <FormField label="Email" name="email" type="email" required />
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
              <FormField label="First Name" name="first_name" required />
              <FormField label="Last Name" name="last_name" required />
            </div>
            <FormField label="Email" name="email" type="email" required />
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
    </div>
  )
}

function actionBtn(bg) {
  return { padding: '4px 14px', borderRadius: 6, background: bg, color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28 }
}
