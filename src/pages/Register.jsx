import { useState } from "react"
import { useNavigate } from "react-router-dom"

function Register() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const navigate = useNavigate()

  const handleRegister = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch("http://localhost:8000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (response.ok) {
        navigate("/")
      }
    } catch (error) {
      console.error("Register error:", error)
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

          <h2 className="text-2xl font-semibold text-white mb-1">Create an account</h2>
          <p className="text-gray-500 text-sm mb-8">Join ParkWatch and get started today</p>

          <form onSubmit={handleRegister}>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 placeholder-gray-600 transition duration-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="mb-8">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 placeholder-gray-600 transition duration-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition duration-200 text-sm tracking-wide"
            >
              Create Account
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account?{" "}
            <a href="/" className="text-green-500 hover:text-green-400 font-medium transition duration-200">
              Sign in here
            </a>
          </p>

          <p className="text-center text-xs text-gray-700 mt-8">
            © 2026 ParkWatch. All rights reserved.
          </p>
        </div>
      </div>

    </div>
  )
}

export default Register