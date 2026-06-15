import { clearAuth } from "../../utils/auth"
import { useNavigate } from "react-router-dom"

export default function CitizenHome() {
  const navigate = useNavigate()
  const handleLogout = () => { clearAuth(); navigate("/login", { replace: true }) }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-600 mb-6">
          <span className="text-white text-2xl font-bold">P</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Citizen Portal</h1>
        <p className="text-gray-500 text-sm mb-8">Report parking violations — coming in Sprint 2.</p>
        <button onClick={handleLogout} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium px-5 py-2.5 rounded-xl transition duration-200">
          Sign Out
        </button>
      </div>
    </div>
  )
}
