import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { auth } from "../services/api"
import { getRoleHome } from "../utils/auth"

function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const data = await auth.login(email, password)
      localStorage.setItem("parkwatch_token", data.token)
      localStorage.setItem("parkwatch_user", JSON.stringify(data.user))
      navigate(getRoleHome(data.user.role), { replace: true })
    } catch (err) {
      setError(err.message || "Invalid email or password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-gray-950">

      {/* Left Panel */}
      <div className="hidden lg:flex w-1/2 flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-green-950 px-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-600 mb-6">
          <span className="text-white text-3xl font-bold">P</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">ParkWatch</h1>
        <p className="text-gray-400 text-center text-sm leading-relaxed max-w-xs">
          A smart parking management system designed for reporting and efficiency.
        </p>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8">
        <div className="w-full max-w-sm">

          {/* Mobile Logo */}
          <div className="flex lg:hidden flex-col items-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-600 mb-3">
              <span className="text-white text-xl font-bold">P</span>
            </div>
            <h1 className="text-2xl font-bold text-white">ParkWatch</h1>
          </div>

          <h2 className="text-2xl font-semibold text-white mb-1">Welcome back!</h2>
          <p className="text-gray-500 text-sm mb-6">Sign in to your account to continue</p>

          {error && (
            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 placeholder-gray-600 transition duration-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="mb-8">
              <label htmlFor="password" className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 placeholder-gray-600 transition duration-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition duration-200 text-sm tracking-wide"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="text-green-500 hover:text-green-400 font-medium transition duration-200">
              Register here
            </Link>
          </p>

          <p className="text-center text-xs text-gray-700 mt-8">
            © 2026 ParkWatch. All rights reserved.
          </p>
        </div>
      </div>

    </div>
  )
}

export default Login
