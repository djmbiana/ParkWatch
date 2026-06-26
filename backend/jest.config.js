module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Load .env.test (override: true) before any test module reads process.env,
  // so unit tests run against deterministic values (e.g. GCS_BUCKET_NAME).
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Force Jest to exit after tests; the mysql2 pool is created lazily but we
  // never open a connection in unit tests, so there are no handles to leak.
  forceExit: true,
};
