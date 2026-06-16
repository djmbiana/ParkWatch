import { NavLink } from "react-router-dom"
import { House, ClipboardList, Bell, User } from "lucide-react"

const TABS = [
  { to: "/citizen",         label: "Home",       icon: House,         end: true },
  { to: "/citizen/reports", label: "My Reports", icon: ClipboardList, end: false },
  { to: "/citizen/alerts",  label: "Alerts",     icon: Bell,          end: false },
  { to: "/citizen/account", label: "Account",    icon: User,          end: false },
]

export default function BottomNav() {
  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        height: "var(--c-nav-height)",
        background: "var(--c-surface)",
        borderTop: "1px solid var(--c-border)",
        paddingBottom: "env(safe-area-inset-bottom)",
        display: "flex",
        zIndex: 50,
      }}
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} style={{ flex: 1, textDecoration: "none" }}>
          {({ isActive }) => (
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "var(--c-nav-height)",
                color: isActive ? "var(--c-primary)" : "var(--c-muted)",
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              <span style={{ fontSize: 11, fontWeight: 500, marginTop: 4 }}>{label}</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
