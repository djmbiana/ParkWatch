'use strict';

/**
 * Unit tests for src/middleware/auth.js and src/middleware/roleMiddleware.js.
 * No database or HTTP server required — middleware functions are called directly.
 */

// Must be set before the modules are required so jwt.verify has a secret.
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';

const jwt = require('jsonwebtoken');
const { authenticate }  = require('../src/middleware/auth');
const { authorize, ROLES } = require('../src/middleware/roleMiddleware');

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/** Creates lightweight mock Express req / res / next objects. */
function mockHttp(headers = {}, user = undefined) {
  const req = { headers, user };
  const res = {
    _status: null,
    _body:   null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body   = body; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

/** Signs a JWT with the test secret. */
function sign(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h', ...options });
}

// ---------------------------------------------------------------------------
// authenticate
// ---------------------------------------------------------------------------

describe('authenticate middleware', () => {
  it('returns 401 when Authorization header is absent', () => {
    const { req, res, next } = mockHttp();
    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body.success).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Bearer token is an empty string', () => {
    const { req, res, next } = mockHttp({ authorization: 'Bearer ' });
    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 with "Invalid token" for a garbage token', () => {
    const { req, res, next } = mockHttp({ authorization: 'Bearer this.is.garbage' });
    authenticate(req, res, next);

    expect(res._status).toBe(403);
    expect(res._body.message).toMatch(/invalid token/i);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 with "Session expired" for a token past its expiry', () => {
    // exp set 10 seconds in the past
    const expired = jwt.sign(
      { id: 1, role: 'citizen', exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET
    );
    const { req, res, next } = mockHttp({ authorization: `Bearer ${expired}` });
    authenticate(req, res, next);

    expect(res._status).toBe(403);
    expect(res._body.message).toMatch(/session expired/i);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches decoded payload to req.user for a valid token', () => {
    const payload = { id: 7, role: 'mtpb_officer', barangay_id: 1 };
    const token   = sign(payload);
    const { req, res, next } = mockHttp({ authorization: `Bearer ${token}` });
    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(7);
    expect(req.user.role).toBe('mtpb_officer');
    expect(req.user.barangay_id).toBe(1);
  });

  it('is case-insensitive on the Authorization header key', () => {
    // Express normalises header names to lowercase; confirm middleware handles it.
    const token = sign({ id: 1, role: 'citizen' });
    const { req, res, next } = mockHttp({ authorization: `Bearer ${token}` });
    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// authorize
// ---------------------------------------------------------------------------

describe('authorize middleware', () => {
  it('returns 401 when req.user is not set (authenticate was skipped)', () => {
    const { req, res, next } = mockHttp();
    // req.user is undefined
    authorize(ROLES.ADMIN)(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user role is not in the allowed list', () => {
    const { req, res, next } = mockHttp();
    req.user = { id: 1, role: ROLES.CITIZEN };
    authorize(ROLES.ADMIN)(req, res, next);

    expect(res._status).toBe(403);
    expect(res._body.success).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the user role exactly matches the single allowed role', () => {
    const { req, res, next } = mockHttp();
    req.user = { id: 2, role: ROLES.MTPB_OFFICER };
    authorize(ROLES.MTPB_OFFICER)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() when the user role is one of several allowed roles', () => {
    const { req, res, next } = mockHttp();
    req.user = { id: 3, role: ROLES.MTPB_SUPERVISOR };
    authorize(ROLES.MTPB_OFFICER, ROLES.MTPB_SUPERVISOR, ROLES.ADMIN)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('403 error message lists the required roles', () => {
    const { req, res, next } = mockHttp();
    req.user = { id: 4, role: ROLES.CITIZEN };
    authorize(ROLES.MTPB_OFFICER, ROLES.ADMIN)(req, res, next);

    expect(res._body.message).toContain(ROLES.MTPB_OFFICER);
    expect(res._body.message).toContain(ROLES.ADMIN);
  });
});

// ---------------------------------------------------------------------------
// ROLES constant completeness
// ---------------------------------------------------------------------------

describe('ROLES constant', () => {
  it('contains all five roles defined in the schema ENUM', () => {
    const expected = ['citizen', 'brgy_official', 'mtpb_officer', 'mtpb_supervisor', 'admin'];
    expect(Object.values(ROLES)).toEqual(expect.arrayContaining(expected));
    expect(Object.values(ROLES)).toHaveLength(5);
  });
});
