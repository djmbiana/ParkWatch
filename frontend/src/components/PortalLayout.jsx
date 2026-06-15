import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { clearAuth, getStoredUser } from '../utils/auth'

export default function PortalLayout({ portalClass, logo, roleLabel, navItems, children, pageTitle }) {
  const navigate = useNavigate()
  const user = getStoredUser()
  const [hoveredLogout, setHoveredLogout] = useState(false)

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U'

  const displayName = user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() : 'User'

  return (
    <div className={portalClass} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-width)',
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100vh',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', marginBottom: 2 }}>
            {logo}
          </div>
          <div style={{ fontSize: 11, color: 'var(--sidebar-text)', lineHeight: 1.4 }}>
            {roleLabel}
          </div>
        </div>

        <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 8px' }} />

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {navItems.map((item, i) => {
            if (item.divider) {
              return <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />
            }
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 16px',
                  height: 36,
                  fontSize: 13,
                  fontWeight: 500,
                  color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                  textDecoration: 'none',
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'background 0.1s, color 0.1s',
                  position: 'relative',
                })}
              >
                {Icon && <Icon size={16} strokeWidth={1.8} />}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span style={{
                    background: 'var(--color-escalated)',
                    color: '#fff',
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 500,
                    padding: '1px 6px',
                    borderRadius: 999,
                    minWidth: 18,
                    textAlign: 'center',
                  }}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '8px 0 16px' }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 8 }} />
          <button
            onClick={handleLogout}
            onMouseEnter={() => setHoveredLogout(true)}
            onMouseLeave={() => setHoveredLogout(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 16px',
              height: 36,
              width: '100%',
              fontSize: 13,
              fontWeight: 500,
              color: hoveredLogout ? '#fff' : 'var(--sidebar-text)',
              background: hoveredLogout ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s, color 0.1s',
              borderLeft: '3px solid transparent',
            }}
          >
            <LogOut size={16} strokeWidth={1.8} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <header style={{
          height: 56,
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 16,
          flexShrink: 0,
        }}>
          <span style={{ flex: 1, fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {pageTitle}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              {displayName}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
