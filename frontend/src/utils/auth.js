const ROLE_HOME = {
  citizen:         "/citizen",
  brgy_official:   "/barangay",
  mtpb_officer:    "/mtpb/officer",
  mtpb_supervisor: "/mtpb/supervisor",
  admin:           "/admin",
}

export function getRoleHome(role) {
  return ROLE_HOME[role] ?? "/login"
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem("parkwatch_user")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearAuth() {
  localStorage.removeItem("parkwatch_token")
  localStorage.removeItem("parkwatch_user")
}
