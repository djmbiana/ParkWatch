'use strict';

/**
 * Unit tests for src/utils/response.js.
 * Verifies that every endpoint in the codebase will use a consistent
 * JSON envelope: { success, message, data?, pagination? }.
 */

const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../src/utils/response');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// Grab the body argument passed to res.json() after calling a helper.
function getBody(res) {
  return res.json.mock.calls[0][0];
}

// ---------------------------------------------------------------------------
// sendSuccess
// ---------------------------------------------------------------------------

describe('sendSuccess', () => {
  it('sends HTTP 200 with success: true', () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 }, 'Done');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getBody(res)).toEqual({ success: true, message: 'Done', data: { id: 1 } });
  });

  it('omits the data key entirely when data is null', () => {
    const res = mockRes();
    sendSuccess(res, null, 'No content');

    expect(getBody(res)).not.toHaveProperty('data');
  });

  it('respects a custom statusCode', () => {
    const res = mockRes();
    sendSuccess(res, null, 'Accepted', 202);

    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('uses "Success" as the default message', () => {
    const res = mockRes();
    sendSuccess(res);

    expect(getBody(res).message).toBe('Success');
  });
});

// ---------------------------------------------------------------------------
// sendCreated
// ---------------------------------------------------------------------------

describe('sendCreated', () => {
  it('sends HTTP 201', () => {
    const res = mockRes();
    sendCreated(res, { id: 42 });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(getBody(res).success).toBe(true);
    expect(getBody(res).data).toEqual({ id: 42 });
  });

  it('uses "Created successfully" as the default message', () => {
    const res = mockRes();
    sendCreated(res);

    expect(getBody(res).message).toBe('Created successfully');
  });
});

// ---------------------------------------------------------------------------
// sendError
// ---------------------------------------------------------------------------

describe('sendError', () => {
  it('sends HTTP 500 by default', () => {
    const res = mockRes();
    sendError(res, 'Something broke');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(getBody(res)).toEqual({ success: false, message: 'Something broke' });
  });

  it('uses the provided statusCode', () => {
    const res = mockRes();
    sendError(res, 'Not found', 404);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('uses "An error occurred" as the default message', () => {
    const res = mockRes();
    sendError(res);

    expect(getBody(res).message).toBe('An error occurred');
  });

  it('never includes success: true', () => {
    const res = mockRes();
    sendError(res, 'Forbidden', 403);

    expect(getBody(res).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sendPaginated
// ---------------------------------------------------------------------------

describe('sendPaginated', () => {
  it('sends HTTP 200 with correct pagination metadata', () => {
    const res = mockRes();
    sendPaginated(res, [{ id: 1 }, { id: 2 }], 50, 2, 10);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getBody(res)).toMatchObject({
      success: true,
      data: [{ id: 1 }, { id: 2 }],
      pagination: { total: 50, page: 2, limit: 10, totalPages: 5 },
    });
  });

  it('calculates totalPages correctly when items do not divide evenly', () => {
    const res = mockRes();
    sendPaginated(res, [], 11, 1, 5);

    expect(getBody(res).pagination.totalPages).toBe(3); // ceil(11/5)
  });

  it('coerces string page/limit to integers', () => {
    const res = mockRes();
    sendPaginated(res, [], 20, '3', '5');

    const { page, limit } = getBody(res).pagination;
    expect(typeof page).toBe('number');
    expect(typeof limit).toBe('number');
  });
});
