const BASE = import.meta.env.VITE_API_URL ?? ''

let _navigate = null
let _toast = null

export function setApiHandlers(navigate, toast) {
  _navigate = navigate
  _toast = toast
}

async function request(path, options = {}) {
  const token = localStorage.getItem('parkwatch_token')
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...options,
    })
  } catch {
    if (_toast) _toast('Network error - check your connection.', 'error')
    throw new Error('Network error')
  }

  let json
  try {
    json = await res.json()
  } catch {
    json = {}
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('parkwatch_token')
      localStorage.removeItem('parkwatch_user')
      if (_navigate) _navigate('/login', { replace: true })
      throw new Error('Session expired')
    }
    if (res.status === 403) {
      if (_toast) _toast("You don't have permission to do this.", 'error')
      throw new Error('Forbidden')
    }
    if (res.status >= 500) {
      if (_toast) _toast('Something went wrong. Please try again.', 'error')
      throw new Error('Server error')
    }
    const msg = json.message ?? json.error ?? json.errors?.[0]?.msg ?? 'Request failed'
    throw new Error(msg)
  }

  return json.data ?? json
}

// Auth
export const auth = {
  login: (email, password) =>
    request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (fields) =>
    request('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(fields) }),
  me: () => request('/api/v1/auth/me'),
  updateProfile: (fields) =>
    request('/api/users/me', { method: 'PATCH', body: JSON.stringify(fields) }),
  changePassword: (current_password, new_password) =>
    request('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),
}

// Reports - barangay
export const reports = {
  barangayQueue:  (params = {}) => request(`/api/reports/queue/barangay${qs(params)}`),
  barangayStats:  (params = {}) => request(`/api/reports/stats/barangay${qs(params)}`),
  mtpbQueue:      (params = {}) => request(`/api/reports/queue/mtpb${qs(params)}`),
  supervisorQueue:(params = {}) => request(`/api/reports/queue/supervisor${qs(params)}`),
  analyticsSum:   (params = {}) => request(`/api/reports/analytics/summary${qs(params)}`),
  repeatOffenders:() => request('/api/reports/analytics/repeat-offenders'),
  violationMap:   (params = {}) => request(`/api/reports/analytics/violation-map${qs(params)}`, { cache: 'no-store' }),
  getById:        (id) => request(`/api/reports/${id}`),
  verify:         (id, body) => request(`/api/reports/${id}/verify`,      { method: 'PATCH', body: JSON.stringify(body) }),
  acknowledge:    (id) =>       request(`/api/reports/${id}/acknowledge`, { method: 'PATCH' }),
  dispatch:       (id) =>       request(`/api/reports/${id}/dispatch`,    { method: 'PATCH' }),
  resolve:        (id, body) => request(`/api/reports/${id}/resolve`,     { method: 'PATCH', body: JSON.stringify(body) }),
  assign:         (id, body) => request(`/api/reports/${id}/assign`,      { method: 'PATCH', body: JSON.stringify(body) }),
  renderAppealVerdict: (id, verdict, verdict_notes) => request(`/api/reports/${id}/appeal-verdict`, { method: 'PATCH', body: JSON.stringify({ verdict, verdict_notes }) }),
}

// Vehicles
export const vehicles = {
  history: (plate) => request(`/api/vehicles/${encodeURIComponent(plate)}/history`),
}

// Admin - users
export const adminUsers = {
  list:       (params = {}) => request(`/api/admin/users${qs(params)}`),
  create:     (body) =>        request('/api/admin/users',              { method: 'POST',  body: JSON.stringify(body) }),
  update:     (id, body) =>    request(`/api/admin/users/${id}`,        { method: 'PATCH', body: JSON.stringify(body) }),
  deactivate: (id) =>          request(`/api/admin/users/${id}/deactivate`, { method: 'PATCH' }),
  reactivate: (id) =>          request(`/api/admin/users/${id}/reactivate`, { method: 'PATCH' }),
  delete:     (id) =>          request(`/api/admin/users/${id}`,            { method: 'DELETE' }),
  officers:              ()          => request('/api/admin/officers'),
  officerStats:          (id)        => request(`/api/admin/officers/${id}/stats`),
  setOfficerSupervisor:  (id, supId) => request(`/api/admin/officers/${id}/supervisor`, { method: 'PATCH', body: JSON.stringify({ supervisor_id: supId }) }),
}

// System config (supervisor + admin)
export const adminConfig = {
  getEscalation:    ()     => request('/api/admin/system-config/escalation'),
  updateEscalation: (body) => request('/api/admin/system-config/escalation', { method: 'PATCH', body: JSON.stringify(body) }),
}

// Admin - barangays
export const adminBarangays = {
  list:   (params = {}) => request(`/api/admin/barangays${qs(params)}`),
  create: (body) =>        request('/api/admin/barangays', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) =>    request(`/api/admin/barangays/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  sync:   (district = 'Malate') => request('/api/admin/barangays/sync', { method: 'POST', body: JSON.stringify({ district }) }),
  toggle: (id) =>          request(`/api/admin/barangays/${id}/toggle`, { method: 'PATCH' }),
  setLocation: (id, latitude, longitude) =>
    request(`/api/admin/barangays/${id}/location`, { method: 'PATCH', body: JSON.stringify({ latitude, longitude }) }),
}

// Admin - streets & rules
export const adminStreets = {
  list:           () =>       request('/api/admin/streets'),
  create:         (body) =>   request('/api/admin/streets',                          { method: 'POST',  body: JSON.stringify(body) }),
  deactivate:     (id) =>     request(`/api/admin/streets/${id}/deactivate`,         { method: 'PATCH' }),
  toggleRule:     (id) =>     request(`/api/admin/parking-rules/${id}/toggle`,       { method: 'PATCH' }),
  updateRule:     (id, body) => request(`/api/admin/parking-rules/${id}`,             { method: 'PATCH', body: JSON.stringify(body) }),
  createRule:     (body) =>   request('/api/admin/parking-rules',                    { method: 'POST',  body: JSON.stringify(body) }),
}

// Admin - penalty tiers
export const adminTiers = {
  list:   () =>         request('/api/admin/penalty-tiers'),
  update: (id, body) => request(`/api/admin/penalty-tiers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  create: (body) =>     request('/api/admin/penalty-tiers',       { method: 'POST',  body: JSON.stringify(body) }),
}

// Admin - user groups (Super Admin only)
export const adminGroups = {
  list:               ()              => request('/api/admin/groups'),
  create:             (body)          => request('/api/admin/groups',                         { method: 'POST',   body: JSON.stringify(body) }),
  update:             (id, body)      => request(`/api/admin/groups/${id}`,                   { method: 'PATCH',  body: JSON.stringify(body) }),
  delete:             (id)            => request(`/api/admin/groups/${id}`,                   { method: 'DELETE' }),
  getPermissions:     (id)            => request(`/api/admin/groups/${id}/permissions`),
  updatePermissions:  (id, perms)     => request(`/api/admin/groups/${id}/permissions`,       { method: 'PUT',    body: JSON.stringify({ permissions: perms }) }),
  assignUserGroup:    (userId, gid)   => request(`/api/admin/users/${userId}/group`,          { method: 'PATCH',  body: JSON.stringify({ group_id: gid }) }),
  assignSupervisor:   (userId, supId) => request(`/api/admin/users/${userId}/supervisor`,     { method: 'PATCH',  body: JSON.stringify({ supervisor_id: supId }) }),
  assignRole:         (userId, role)  => request(`/api/admin/users/${userId}/role`,           { method: 'PATCH',  body: JSON.stringify({ role }) }),
}

// RBAC - permission definitions (Super Admin only)
export const adminPermissions = {
  list: () => request('/api/admin/permissions'),
}

// Audit logs (Super Admin only)
export const adminAudit = {
  list: (params = {}) => request(`/api/admin/audit-logs${qs(params)}`),
}

// My permissions — called once after login to bootstrap PermissionsContext
export const myPermissions = () => request('/api/permissions/mine')

function qs(params) {
  // URLSearchParams stringifies undefined/null as the literal text "undefined"/
  // "null" rather than omitting the key, so callers passing `foo: bar || undefined`
  // for an optional filter would otherwise always send foo=undefined.
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  const s = new URLSearchParams(cleaned).toString()
  return s ? `?${s}` : ''
}

// ---------------------------------------------------------------------------
// Citizen (anonymous) API - per the research paper, citizens have no account.
// These calls send NO Authorization header and never redirect to /login on
// auth errors. Thrown errors carry `.status` so the wizard can branch on
// 409 (duplicate) / 422 (rule inactive); `.isNetwork` flags connectivity loss.
// ---------------------------------------------------------------------------
async function publicRequest(path, { timeoutMs = 60000, ...options } = {}) {
  // Abort a stalled request instead of spinning indefinitely (e.g. a flaky
  // mobile upload). The caller's UI surfaces a retryable error.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res
  try {
    res = await fetch(`${BASE}${path}`, { ...options, signal: controller.signal })
  } catch (e) {
    const err = e?.name === 'AbortError'
      ? new Error('This is taking too long - please check your connection and try again.')
      : new Error('Network error - check your connection.')
    err.isNetwork = true
    throw err
  } finally {
    clearTimeout(timer)
  }

  let json
  try {
    json = await res.json()
  } catch {
    json = {}
  }

  if (!res.ok) {
    const msg = json.message ?? json.error ?? json.errors?.[0]?.msg ?? 'Request failed'
    const err = new Error(msg)
    err.status = res.status
    err.data = json  // full response body for structured error handling (e.g. 409 duplicate)
    throw err
  }

  return json.data ?? json
}

const jsonPost = (path, body) =>
  publicRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const citizen = {
  // Reference data (already public on the backend)
  streets:        () =>          publicRequest('/api/streets'),
  violationTypes: (streetId) =>  publicRequest(`/api/streets/${streetId}/violation-types`),

  // Photo upload - multipart/form-data, field "photo". Let the browser set the
  // multipart boundary, so no Content-Type header here.
  uploadPhoto: (file) => {
    const form = new FormData()
    form.append('photo', file)
    return publicRequest('/api/upload/photo', { method: 'POST', body: form })
  },

  // Preview steps (no report created yet)
  ocrPreview:     (photo_url) => jsonPost('/api/reports/ocr', { photo_url }),
  penaltyPreview: (plate) =>     jsonPost('/api/reports/penalty-preview', { plate }),
  // Advisory: has this plate already been reported on this street recently?
  checkDuplicate: (plate, street_id) => jsonPost('/api/reports/check-duplicate', { plate, street_id }),

  // Submission pipeline
  createReport:  (body) => jsonPost('/api/reports', body),
  confirmReport: (body) => jsonPost('/api/reports/confirm', body),
  // Appends ?token={access_token} for citizen report fetches (FR-16 anti-enumeration):
  // anonymous reads require the per-report access token returned at submission and
  // stored in localStorage['parkwatch_report_tokens']. Without it the API returns 401,
  // so report ids cannot be enumerated.
  getReport:     (id, token) =>
    publicRequest(`/api/reports/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`),

  // Attach extra evidence photos to an existing report.
  // token: the per-report access_token (original reporter) or null (witness/corroborate mode).
  attachPhotos: (reportId, token, additional_photos) => {
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    return publicRequest(`/api/reports/${reportId}/additional-photos${qs}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ additional_photos }),
    })
  },

  // FCM token registration (anonymous) - best-effort, see CitizenLayout
  registerToken: (fcm_token) => jsonPost('/api/notifications/register-token', { fcm_token }),

  // Contest a declined report (one-time appeal, requires per-report access token)
  contestReport: (reportId, token, reason) =>
    publicRequest(`/api/reports/${reportId}/contest?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
}

// localStorage helpers for the anonymous citizen identity.
const REPORTS_KEY = 'parkwatch_reports'
const ALIAS_KEY   = 'parkwatch_alias'
const TOKENS_KEY  = 'parkwatch_report_tokens'  // { [report_id]: access_token }
const FCM_KEY     = 'parkwatch_fcm_token'       // set by services/fcm.js

export const citizenStore = {
  getReportIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(REPORTS_KEY) ?? '[]')
      return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : []
    } catch {
      return []
    }
  },
  // Records a submitted report id and its access token together.
  addReportId(id, token) {
    const ids = citizenStore.getReportIds()
    if (!ids.includes(id)) {
      ids.push(id)
      localStorage.setItem(REPORTS_KEY, JSON.stringify(ids))
    }
    if (token) {
      const map = citizenStore._tokens()
      map[id] = token
      localStorage.setItem(TOKENS_KEY, JSON.stringify(map))
    }
  },
  getToken(id) {
    return citizenStore._tokens()[id] ?? null
  },
  _tokens() {
    try {
      const m = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}')
      return m && typeof m === 'object' ? m : {}
    } catch {
      return {}
    }
  },
  getAlias() {
    return localStorage.getItem(ALIAS_KEY) || null
  },
  setAlias(alias) {
    if (alias) localStorage.setItem(ALIAS_KEY, alias)
  },
  getFcmToken() {
    return localStorage.getItem(FCM_KEY) || null
  },
}
