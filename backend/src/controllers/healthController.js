'use strict';

/**
 * Health check — a liveness probe that ALSO reports DB reachability. Served at
 * both /api/health and /api/v1/health. It always returns 200 (the API process
 * is up); the `db` field tells callers whether the database is reachable, so
 * the probe still works when imported without a live DB (jest/supertest).
 *
 * Response carries the legacy shape (success/message, "running") and the
 * audit's shape (status/db) for compatibility.
 */

const { pool } = require('../config/db');

const pingDb = async () => {
  let timer;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 1500); }),
    ]);
    return 'connected';
  } catch {
    return 'disconnected';
  } finally {
    clearTimeout(timer);
  }
};

const health = async (req, res) => {
  const db = await pingDb();
  return res.status(200).json({
    success: true,
    status: 'ok',
    db,
    message: 'ParkWatch API is running and healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
};

module.exports = { health };
