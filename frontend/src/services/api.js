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
    if (_toast) _toast('Network error — check your connection.', 'error')
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
}

// Reports — barangay
export const reports = {
  barangayQueue:  (params = {}) => request(`/api/reports/queue/barangay${qs(params)}`),
  barangayStats:  () => request('/api/reports/stats/barangay'),
  mtpbQueue:      (params = {}) => request(`/api/reports/queue/mtpb${qs(params)}`),
  analyticsSum:   (params = {}) => request(`/api/reports/analytics/summary${qs(params)}`),
  repeatOffenders:() => request('/api/reports/analytics/repeat-offenders'),
  getById:        (id) => request(`/api/reports/${id}`),
  verify:         (id, body) => request(`/api/reports/${id}/verify`,      { method: 'PATCH', body: JSON.stringify(body) }),
  acknowledge:    (id) =>       request(`/api/reports/${id}/acknowledge`, { method: 'PATCH' }),
  dispatch:       (id) =>       request(`/api/reports/${id}/dispatch`,    { method: 'PATCH' }),
  resolve:        (id, body) => request(`/api/reports/${id}/resolve`,     { method: 'PATCH', body: JSON.stringify(body) }),
  assign:         (id, body) => request(`/api/reports/${id}/assign`,      { method: 'PATCH', body: JSON.stringify(body) }),
}

// Vehicles
export const vehicles = {
  history: (plate) => request(`/api/vehicles/${encodeURIComponent(plate)}/history`),
}

// Admin — users
export const adminUsers = {
  list:       (params = {}) => request(`/api/admin/users${qs(params)}`),
  create:     (body) =>        request('/api/admin/users',              { method: 'POST',  body: JSON.stringify(body) }),
  update:     (id, body) =>    request(`/api/admin/users/${id}`,        { method: 'PATCH', body: JSON.stringify(body) }),
  deactivate: (id) =>          request(`/api/admin/users/${id}/deactivate`, { method: 'PATCH' }),
  reactivate: (id) =>          request(`/api/admin/users/${id}/reactivate`, { method: 'PATCH' }),
  officers:   () =>            request('/api/admin/officers'),
}

// Admin — barangays
export const adminBarangays = {
  list:   (params = {}) => request(`/api/admin/barangays${qs(params)}`),
  toggle: (id) =>          request(`/api/admin/barangays/${id}/toggle`, { method: 'PATCH' }),
}

// Admin — streets & rules
export const adminStreets = {
  list:           () =>       request('/api/admin/streets'),
  create:         (body) =>   request('/api/admin/streets',                    { method: 'POST',  body: JSON.stringify(body) }),
  toggleRule:     (id) =>     request(`/api/admin/parking-rules/${id}/toggle`, { method: 'PATCH' }),
  createRule:     (body) =>   request('/api/admin/parking-rules',              { method: 'POST',  body: JSON.stringify(body) }),
}

// Admin — penalty tiers
export const adminTiers = {
  list:   () =>         request('/api/admin/penalty-tiers'),
  update: (id, body) => request(`/api/admin/penalty-tiers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  create: (body) =>     request('/api/admin/penalty-tiers',       { method: 'POST',  body: JSON.stringify(body) }),
}

function qs(params) {
  const s = new URLSearchParams(params).toString()
  return s ? `?${s}` : ''
}
