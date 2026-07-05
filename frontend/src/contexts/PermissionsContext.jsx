import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { myPermissions } from '../services/api'
import { getStoredUser } from '../utils/auth'

const PermissionsContext = createContext(null)

/**
 * Loads the logged-in user's permission set from GET /api/permissions/mine
 * once on mount (and whenever the token changes). Provides:
 *
 *   permissions  — raw array of { module_name, function_name, can_* }
 *   group        — { id, name, is_system_role } or null
 *   hasPermission(module, func, action) — boolean helper
 *   canAccessModule(module) — true if the user has any CRUD flag in that module
 *   loading      — true while the initial fetch is in flight
 *   reload()     — re-fetches (call after login/group change)
 */
export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState([])
  const [group, setGroup]             = useState(null)
  const [loading, setLoading]         = useState(true)

  const reload = useCallback(async () => {
    const user = getStoredUser()
    if (!user || user.role === 'citizen') {
      setPermissions([])
      setGroup(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await myPermissions()
      setPermissions(data.permissions ?? [])
      setGroup(data.group ?? null)
    } catch {
      // If the endpoint 401s (expired token) the api.js handler redirects to /login.
      // For any other error degrade to empty — routes will 403 server-side anyway.
      setPermissions([])
      setGroup(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const ACTION_COL = { create: 'can_create', read: 'can_read', update: 'can_update', delete: 'can_delete' }

  const hasPermission = useCallback((module, func, action) => {
    if (group?.is_system_role) return true  // Super Admin bypasses all checks
    const col = ACTION_COL[action]
    if (!col) return false
    const perm = permissions.find((p) => p.module_name === module && p.function_name === func)
    return perm ? !!perm[col] : false
  }, [permissions, group])

  const canAccessModule = useCallback((module) => {
    if (group?.is_system_role) return true
    return permissions.some(
      (p) => p.module_name === module && (p.can_create || p.can_read || p.can_update || p.can_delete),
    )
  }, [permissions, group])

  return (
    <PermissionsContext.Provider value={{ permissions, group, loading, hasPermission, canAccessModule, reload }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used inside <PermissionsProvider>')
  return ctx
}
