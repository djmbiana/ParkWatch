'use strict';

/**
 * Unit tests for src/middleware/errorHandler.js.
 * The handler is called with (err, req, res, next) — Express identifies it by
 * its 4-argument signature, which is why no-unused-vars is suppressed there.
 */

// Silence winston output so test results stay readable.
jest.mock('../src/config/logger', () => ({
  error: jest.fn(),
  warn:  jest.fn(),
  info:  jest.fn(),
  debug: jest.fn(),
  http:  jest.fn(),
}));

const { errorHandler } = require('../src/middleware/errorHandler');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

const req  = {};
const next = jest.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('errorHandler middleware', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 413 for multer LIMIT_FILE_SIZE errors', () => {
    const res = mockRes();
    errorHandler({ code: 'LIMIT_FILE_SIZE', message: 'File too large' }, req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.stringMatching(/10MB/i) })
    );
  });

  it('returns 403 for JsonWebTokenError (malformed token passed through to handler)', () => {
    const res = mockRes();
    errorHandler({ name: 'JsonWebTokenError', message: 'jwt malformed' }, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('returns 409 for MySQL ER_DUP_ENTRY errors', () => {
    const res = mockRes();
    errorHandler({ code: 'ER_DUP_ENTRY', message: "Duplicate entry 'x' for key 'email'" }, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('uses err.statusCode when explicitly set', () => {
    const res = mockRes();
    errorHandler({ statusCode: 422, message: 'Validation failed' }, req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Validation failed' })
    );
  });

  it('defaults to 500 for a plain Error', () => {
    const res = mockRes();
    errorHandler(new Error('Something broke unexpectedly'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('includes stack trace in development mode', () => {
    process.env.NODE_ENV = 'development';
    const res = mockRes();
    const err = new Error('Dev error');
    errorHandler(err, req, res, next);

    const [body] = res.json.mock.calls[0];
    expect(body).toHaveProperty('stack');

    delete process.env.NODE_ENV;
  });

  it('omits stack trace in production mode', () => {
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    errorHandler(new Error('Prod error'), req, res, next);

    const [body] = res.json.mock.calls[0];
    expect(body).not.toHaveProperty('stack');

    delete process.env.NODE_ENV;
  });
});
