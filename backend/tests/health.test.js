const request = require('supertest');
const app = require('../src/app');

// Smoke test for the scaffold: the app must be importable and serve the health
// probe WITHOUT a database connection (server.js owns DB/Firebase startup).
describe('GET /api/v1/health', () => {
  it('returns 200 with a success payload', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/running/i);
  });
});

describe('unknown routes', () => {
  it('returns a 404 JSON envelope', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
