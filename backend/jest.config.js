module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Force Jest to exit after tests; the mysql2 pool is created lazily but we
  // never open a connection in unit tests, so there are no handles to leak.
  forceExit: true,
};
