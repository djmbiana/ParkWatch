import { useEffect } from "react"
import { Outlet } from "react-router-dom"
import BottomNav from "../../components/citizen/BottomNav"
import { registerForPush } from "../../services/fcm"

// Citizen app shell. Public - NO auth guard, NO redirect to login (citizens
// report anonymously per the research paper, p.118).
export default function CitizenLayout() {
  // Best-effort anonymous push registration (UC-03). No-ops unless Firebase is
  // configured and the citizen grants permission (AF-1 - silent otherwise).
  useEffect(() => { registerForPush() }, [])

  return (
    <div
      className="citizen-app"
      style={{
        minHeight: "100dvh",
        background: "var(--c-bg)",
        color: "var(--c-text)",
        maxWidth: 480,
        margin: "0 auto",
        position: "relative",
      }}
    >
      <main
        style={{
          paddingBottom: "calc(var(--c-nav-height) + env(safe-area-inset-bottom))",
        }}
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
