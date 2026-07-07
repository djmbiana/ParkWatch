import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { auth } from '../services/api'
import { getStoredUser } from '../utils/auth'
import { useToast } from '../components/ToastContext'
import LoadingSpinner from '../components/LoadingSpinner'

const ROLE_LABEL = {
  brgy_official: 'Barangay Official',
  mtpb_officer: 'MTPB Officer',
  mtpb_supervisor: 'MTPB Supervisor',
  admin: 'Administrator',
  citizen: 'Citizen',
}

const inputStyle = {
  width: '100%', height: 40, padding: '0 12px', marginTop: 6,
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  fontSize: 14, color: 'var(--color-text-primary)', background: 'var(--color-surface)', outline: 'none',
}
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }

export default function ProfilePage() {
  const { setPageTitle } = useOutletContext()
  const toast = useToast()
  const [user, setUser] = useState(getStoredUser())

  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [lastName, setLastName] = useState(user?.last_name ?? '')
  const [employeeId, setEmployeeId] = useState(user?.anonymous_alias ?? '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setPageTitle('Profile') }, [setPageTitle])

  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase() || 'U'
  const changingPw = currentPw || newPw || confirmPw

  const save = async (e) => {
    e.preventDefault()

    const body = {}
    if (firstName.trim() && firstName.trim() !== user?.first_name) body.first_name = firstName.trim()
    if (lastName.trim() && lastName.trim() !== user?.last_name) body.last_name = lastName.trim()
    if (user?.role !== 'citizen' && employeeId.trim() && employeeId.trim() !== user?.anonymous_alias) body.employee_id = employeeId.trim()

    if (changingPw) {
      if (newPw.length < 8) { toast('New password must be at least 8 characters.', 'error'); return }
      if (newPw !== confirmPw) { toast('New passwords do not match.', 'error'); return }
      if (!currentPw) { toast('Enter your current password.', 'error'); return }
      body.current_password = currentPw
      body.new_password = newPw
    }

    if (Object.keys(body).length === 0) { toast('Nothing to update.', 'error'); return }

    setSaving(true)
    try {
      const data = await auth.updateProfile(body)
      const updated = data?.user ?? data
      localStorage.setItem('parkwatch_user', JSON.stringify(updated))
      setUser(updated)
      setEmployeeId(updated?.anonymous_alias ?? employeeId)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      toast('Profile updated.', 'success')
    } catch (err) {
      if (err.message !== 'Forbidden' && err.message !== 'Session expired') {
        toast(err.message || 'Could not update profile.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 480 }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{user?.first_name} {user?.last_name}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{ROLE_LABEL[user?.role] ?? user?.role}</div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
          <strong>Email:</strong> {user?.email ?? '-'}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>First name</label>
            <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Last name</label>
            <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        {user?.role !== 'citizen' && (
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Badge / Employee ID</label>
            <input
              style={inputStyle}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g. MTPB-2025-001"
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Shown on enforcement records and queue listings.
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Change password</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>Leave blank to keep your current password.</div>
          <label style={labelStyle}>Current password</label>
          <input style={inputStyle} type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>New password</label>
              <input style={inputStyle} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Confirm new</label>
              <input style={inputStyle} type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ marginTop: 24, width: '100%', height: 42, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          {saving && <LoadingSpinner size={14} color="#fff" />}
          Save Changes
        </button>
      </div>
    </form>
  )
}
