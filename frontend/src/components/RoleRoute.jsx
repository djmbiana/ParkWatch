import { Navigate } from "react-router-dom"
import { getStoredUser } from "../utils/auth"

export default function RoleRoute({ allowedRoles, children }) {
  const token = localStorage.getItem("parkwatch_token")
  if (!token) return <Navigate to="/login" replace />

  const user = getStoredUser()
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />
  }

  return children
}
