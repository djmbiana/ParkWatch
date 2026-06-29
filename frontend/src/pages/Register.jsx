import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { auth } from "../services/api"
import { getRoleHome } from "../utils/auth"

function Register() {
  const [fields, setFields] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    password: "",
  })
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }))

  const handleRegister = async (e) => {
    e.preventDefault()
    setError("")
    if (fields.password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    setLoading(true)
    try {
      const data = await auth.register(fields)
      localStorage.setItem("parkwatch_token", data.token)
      localStorage.setItem("parkwatch_user", JSON.stringify(data.user))
      navigate(getRoleHome(data.user.role), { replace: true })
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    "w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:bg-white focus:border-[#3DA044] focus:ring-2 focus:ring-[#3DA044]/30 placeholder-gray-400 transition duration-200"
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"

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
          A smart parking management system designed for reporting and efficiency.
        </p>
      </div>

      {/* Right Panel - form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 py-12 bg-white">
        <div className="w-full max-w-sm">

          {/* Mobile Logo */}
          <div className="flex lg:hidden flex-col items-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: "#3DA044" }}>
              <span className="text-white text-xl font-bold">P</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ParkWatch</h1>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Create an account</h2>
          <p className="text-gray-500 text-sm mb-6">Join ParkWatch and get started today</p>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} noValidate>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label htmlFor="first_name" className={labelClass}>First Name</label>
                <input id="first_name" type="text" placeholder="Juan" className={inputClass}
                  value={fields.first_name} onChange={set("first_name")} required autoComplete="given-name" />
              </div>
              <div className="flex-1">
                <label htmlFor="last_name" className={labelClass}>Last Name</label>
                <input id="last_name" type="text" placeholder="dela Cruz" className={inputClass}
                  value={fields.last_name} onChange={set("last_name")} required autoComplete="family-name" />
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="email" className={labelClass}>Email Address</label>
              <input id="email" type="email" placeholder="you@example.com" className={inputClass}
                value={fields.email} onChange={set("email")} required autoComplete="email" />
            </div>

            <div className="mb-4">
              <label htmlFor="phone_number" className={labelClass}>Phone Number</label>
              <input id="phone_number" type="tel" placeholder="+639XXXXXXXXX" className={inputClass}
                value={fields.phone_number} onChange={set("phone_number")} autoComplete="tel" />
            </div>

            <div className="mb-4">
              <label htmlFor="password" className={labelClass}>Password</label>
              <input id="password" type="password" placeholder="••••••••" className={inputClass}
                value={fields.password} onChange={set("password")} required autoComplete="new-password" />
            </div>

            <div className="mb-8">
              <label htmlFor="confirm_password" className={labelClass}>Confirm Password</label>
              <input id="confirm_password" type="password" placeholder="••••••••" className={inputClass}
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                required autoComplete="new-password" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3 rounded-xl transition duration-200 text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-95"
              style={{ background: "linear-gradient(135deg, #3DA044 0%, #2F7D36 100%)" }}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{" "}
            <Link to="/" className="font-medium transition duration-200" style={{ color: "#2F7D36" }}>
              Sign in here
            </Link>
          </p>

          <p className="text-center text-xs text-gray-400 mt-8">
            © 2026 ParkWatch. All rights reserved.
          </p>
        </div>
      </div>

    </div>
  )
}

export default Register
