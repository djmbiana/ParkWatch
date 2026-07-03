import { useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { User, KeyRound } from "lucide-react"
import { getStoredUser, getRoleHome } from "../utils/auth"

// Entry screen: splits anonymous citizens (who need no account) from staff /
// officials (who sign in). Barangay, MTPB and Admin all share one login - their
// account role decides where they land afterward.
function Landing() {
  const navigate = useNavigate()

  // A staff member who already has a session skips the chooser and goes straight
  // to their portal (anonymous citizens have no stored user, so they still choose).
  useEffect(() => {
    const token = localStorage.getItem("parkwatch_token")
    const user = getStoredUser()
    if (token && user?.role && user.role !== "citizen") {
      navigate(getRoleHome(user.role), { replace: true })
    }
  }, [navigate])

  const Card = ({ icon: Icon, title, subtitle, onClick }) => (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition duration-200 p-5 flex items-center gap-4"
      style={{ borderLeftWidth: 4, borderLeftColor: "#3DA044" }}
    >
      <span
        className="inline-flex items-center justify-center w-11 h-11 rounded-full shrink-0"
        style={{ background: "#ECF6ED", color: "#2F7D36" }}
        aria-hidden
      >
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <div className="text-gray-900 font-semibold text-base" style={{ transition: "color .2s" }}>
          {title}
        </div>
        <div className="text-gray-500 text-sm mt-0.5">{subtitle}</div>
      </div>
      <span className="ml-auto pl-2 transition" style={{ color: "#3DA044" }} aria-hidden>→</span>
    </button>
  )

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6"
      style={{ background: "linear-gradient(180deg, #EAF6EC 0%, #F4F9F5 40%, #FFFFFF 100%)" }}
    >
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-9">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-sm"
            style={{ background: "linear-gradient(135deg, #3DA044 0%, #2F7D36 100%)" }}
          >
            <span className="text-white text-2xl font-bold">P</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">ParkWatch</h1>
          <p className="text-gray-500 text-sm mt-2 text-center">
            OCR-assisted parking violation reporting - Malate, Manila
          </p>
        </div>

        <h2 className="text-center text-sm font-semibold uppercase tracking-wider mb-5" style={{ color: "#2F7D36" }}>
          How are you using ParkWatch?
        </h2>

        <div className="flex flex-col gap-4">
          <Card
            icon={User}
            title="I'm a Citizen"
            subtitle="Report a parking violation - no account needed."
            onClick={() => navigate("/citizen")}
          />
          <Card
            icon={KeyRound}
            title="Staff / Official Login"
            subtitle="Barangay · MTPB · Admin - sign in to your account."
            onClick={() => navigate("/login")}
          />
        </div>

        <p className="text-center text-xs text-gray-500 mt-10">
          Bugs or questions?{" "}
          <a href="mailto:ParkWatch.feedback@gmail.com" className="font-medium" style={{ color: "#3DA044" }}>
            ParkWatch.feedback@gmail.com
          </a>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          <Link to="/privacy" style={{ color: "#3DA044" }}>Privacy Notice</Link>
          {" · "}© 2026 ParkWatch. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default Landing
