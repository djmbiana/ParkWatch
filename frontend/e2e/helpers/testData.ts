// Shared constants for the ParkWatch E2E suite.
//
// IMPORTANT: the backend mounts the full router at /api/v1 and provides
// UNVERSIONED aliases for most resources (/api/reports, /api/admin, ...) — but
// NOT for /auth. So login is reachable ONLY at /api/v1/auth/login. See
// backend/src/app.js.

export const BASE_URL = 'http://localhost:5173';
export const API_URL = 'http://localhost:3000';

// Auth lives only under /api/v1 (no unversioned alias).
export const LOGIN_PATH = '/api/v1/auth/login';

export const TEST_USERS = {
  barangay:   { email: 'barangay@test.com',   password: 'Test1234!', role: 'brgy_official'   },
  officer:    { email: 'officer@test.com',     password: 'Test1234!', role: 'mtpb_officer'    },
  supervisor: { email: 'supervisor@test.com',  password: 'Test1234!', role: 'mtpb_supervisor' },
  admin:      { email: 'admin@test.com',       password: 'Test1234!', role: 'admin'           },
} as const;

// Partner barangay officials (one per each of the 5 UAT partner barangays).
// barangay@test.com is the generic alias assigned to Barangay 726.
export const PARTNER_BARANGAY_OFFICIALS = [
  { email: 'barangay726@test.com', barangay: 'Barangay 726' },
  { email: 'barangay727@test.com', barangay: 'Barangay 727' },
  { email: 'barangay729@test.com', barangay: 'Barangay 729' },
  { email: 'barangay730@test.com', barangay: 'Barangay 730' },
  { email: 'barangay762@test.com', barangay: 'Barangay 762' },
] as const;

export const TEST_STREET_ID = 1;
export const TEST_VIOLATION = 'Parked on Sidewalk';

// localStorage keys (see frontend/src/services/api.js + utils/auth.js).
export const STORAGE = {
  token:        'parkwatch_token',
  user:         'parkwatch_user',
  reports:      'parkwatch_reports',
  alias:        'parkwatch_alias',
  reportTokens: 'parkwatch_report_tokens',
} as const;

// Exact paper message strings (UC-03, p.72). Kept for assertions against the
// NOTIFICATION_LOG / notification feed.
export const NOTIFICATION_MESSAGES = {
  pending:      'Report Submitted Pending Barangay Verification.',
  verified:     'Report Verified - Awaiting MTPB Action.',
  acknowledged: 'Report Acknowledged by MTPB Officer.',
  dispatched:   'Officer Dispatched to Location.',
  resolved:     (outcome: string) => `Report Resolved [${outcome}].`,
  rejected:     (reason: string)  => `Report Rejected [${reason}].`,
  escalated:    'Your report has been escalated to a supervisor for priority attention.',
} as const;

// Escalation config keys (migration 032 SYSTEM_CONFIG).
export const ESCALATION_CONFIG_KEYS = {
  responseWindow: 'escalation_response_window_minutes',
  renotifyWindow: 'escalation_renotify_window_minutes',
} as const;
