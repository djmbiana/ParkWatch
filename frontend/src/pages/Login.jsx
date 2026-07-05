import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { auth } from "../services/api"
import { getRoleHome } from "../utils/auth"
import { usePermissions } from "../contexts/PermissionsContext"

function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { reload } = usePermissions()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const data = await auth.login(email, password)
      localStorage.setItem("parkwatch_token", data.token)
      localStorage.setItem("parkwatch_user", JSON.stringify(data.user))
      await reload()
      navigate(getRoleHome(data.user.role), { replace: true })
    } catch (err) {
      setError(err.message || "Invalid email or password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-[#F1F8F2]">

      {/* Left Panel - green brand */}
      <div
        className="hidden lg:flex w-1/2 flex-col items-center justify-center px-12"
        style={{ background: "linear-gradient(135deg, #3DA044 0%, #2F7D36 100%)" }}
      >
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/15 ring-1 ring-white/30 mb-6">
          <span className="text-white text-3xl font-bold">P</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">ParkWatch</h1>
        <p className="text-white/80 text-center text-sm leading-relaxed max-w-xs">
          OCR-assisted parking violation reporting for Malate, Manila.
        </p>
      </div>

      {/* Right Panel - form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 bg-white">
        <div className="w-full max-w-sm">

          {/* Mobile Logo */}
          <div className="flex lg:hidden flex-col items-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: "#3DA044" }}>
              <span className="text-white text-xl font-bold">P</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ParkWatch</h1>
          </div>

          <Link to="/" className="inline-flex items-center gap-1 text-gray-400 hover:text-[#2F7D36] text-sm mb-6 transition duration-200">
            ← Back
          </Link>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Staff / Official Sign In</h2>
          <p className="text-gray-500 text-sm mb-6">Barangay, MTPB and Admin accounts</p>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:bg-white focus:border-[#3DA044] focus:ring-2 focus:ring-[#3DA044]/30 placeholder-gray-400 transition duration-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="mb-8">
              <label htmlFor="password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:bg-white focus:border-[#3DA044] focus:ring-2 focus:ring-[#3DA044]/30 placeholder-gray-400 transition duration-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold py-3 rounded-xl transition duration-200 text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-95"
              style={{ background: "linear-gradient(135deg, #3DA044 0%, #2F7D36 100%)" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="mt-6 rounded-xl border px-4 py-3" style={{ borderColor: "#CDE9D2", background: "#F1F8F2" }}>
            <p className="text-xs leading-relaxed" style={{ color: "#2F7D36" }}>
              <span className="font-semibold">No account yet?</span> Accounts are created by your
              team's supervisor or manager (barangay captain, MTPB supervisor, etc.). Please follow
              up with them to have your account set up.
            </p>
          </div>

          <p className="text-center text-xs text-gray-500 mt-8">
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

    </div>
  )
}

export default Login
