import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { auth } from "../services/api"
import { getRoleHome } from "../utils/auth"
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react"

export default function ChangePassword() {
  const [current, setCurrent]     = useState("")
  const [next, setNext]           = useState("")
  const [confirm, setConfirm]     = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext]   = useState(false)
  const [error, setError]         = useState("")
  const [loading, setLoading]     = useState(false)
  const navigate = useNavigate()

  const userRaw = localStorage.getItem("parkwatch_user")
  const user = userRaw ? JSON.parse(userRaw) : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    if (next.length < 8) {
      setError("New password must be at least 8 characters.")
      return
    }
    if (next !== confirm) {
      setError("Passwords do not match.")
      return
    }
    setLoading(true)
    try {
      const data = await auth.changePassword(current, next)
      // Refresh stored token and user — must_change_password is now false.
      localStorage.setItem("parkwatch_token", data.token)
      localStorage.setItem("parkwatch_user", JSON.stringify(data.user))
      navigate(getRoleHome(data.user.role), { replace: true })
    } catch (err) {
      setError(err.message || "Failed to change password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-[#F1F8F2]">

      {/* Left branding panel */}
      <div
        className="hidden lg:flex w-1/2 flex-col items-center justify-center px-12"
        style={{ background: "linear-gradient(135deg, #3DA044 0%, #2F7D36 100%)" }}
      >
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/15 ring-1 ring-white/30 mb-6">
          <ShieldCheck size={40} color="white" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">Secure Your Account</h1>
        <p className="text-white/80 text-center text-sm leading-relaxed max-w-xs">
          Your administrator has given you a temporary password. Please set a permanent password before continuing.
        </p>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 bg-white">
        <div className="w-full max-w-sm">

          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
              style={{ background: "#E8F5E9" }}>
              <Lock size={22} color="#3DA044" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Change Password</h2>
            <p className="text-sm text-gray-500 mt-1">
              {user ? `Logged in as ${user.email}` : "Set a new password to continue."}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Current (temporary) password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temporary Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  required
                  placeholder="Enter the password you were given"
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 pr-10 text-sm text-gray-900 outline-none focus:border-[#3DA044] focus:ring-2 focus:ring-[#3DA044]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNext ? "text" : "password"}
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 pr-10 text-sm text-gray-900 outline-none focus:border-[#3DA044] focus:ring-2 focus:ring-[#3DA044]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowNext(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showNext ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {next.length > 0 && next.length < 8 && (
                <p className="mt-1 text-xs text-red-500">Must be at least 8 characters.</p>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Re-enter new password"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-[#3DA044] focus:ring-2 focus:ring-[#3DA044]/20"
              />
              {confirm.length > 0 && next !== confirm && (
                <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "#3DA044" }}
            >
              {loading ? "Saving..." : "Set New Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
