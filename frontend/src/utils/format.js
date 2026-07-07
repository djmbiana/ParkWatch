// Shared formatters for the citizen app.

// "Sep 14, 2025 · 10:30 AM" - the timestamp format used throughout the
// citizen screens (matches the research paper's report mockups).
export function formatDateTime(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} · ${time}`
}

// Philippine plate format: current "ABC 1234", legacy "ABC 123" (pre-2014
// series, still on the road), motorcycle "ABC 12-3456".
export const PLATE_RE = /^[A-Z]{3} \d{4}$|^[A-Z]{3} \d{3}$|^[A-Z]{3} \d{2}-\d{4}$/

// Conduction sticker: 2-char district code + space + 4-char alphanumeric body.
// e.g. "AA 123A", "D1 E777"
export const CONDUCTION_RE = /^[A-Z][A-Z0-9] [A-Z0-9]{4}$/

// Temporary Motor Vehicle Plate (white "REGISTERED" / dealer-issued).
// 4-wheel: "AB 1234" (2 letters + 4 digits).
// Improvised MC (lost/mutilated): "AB 12345" (2 letters + 5 digits).
export const TEMPORARY_RE    = /^[A-Z]{2} \d{4}$/
export const TEMPORARY_MC_RE = /^[A-Z]{2} \d{5}$/

export function isValidPlate(value) {
  return PLATE_RE.test((value ?? '').trim().toUpperCase())
}

export function isValidConductionPlate(value) {
  return CONDUCTION_RE.test((value ?? '').trim().toUpperCase())
}

export function isValidTemporaryPlate(value) {
  const v = (value ?? '').trim().toUpperCase()
  return TEMPORARY_RE.test(v) || TEMPORARY_MC_RE.test(v)
}

// Human-readable penalty for the 4-tier structure (migration 022), e.g.
// "1st Offense - Verbal Warning · No fine" or "2nd Offense - Ticket · ₱500".
export function formatPenalty(tier) {
  if (!tier) return '-'
  const action = tier.enforcement_action ? ` - ${tier.enforcement_action}` : ''
  const amount = Number(tier.fine_amount)
  const fine = amount > 0 ? ` · ₱${amount.toLocaleString()}` : ' · No fine'
  return `${tier.tier_name}${action}${fine}`
}
