const jwt = require('jsonwebtoken');

// Verifies a Bearer JWT and attaches the decoded payload to req.user.
// This is reusable infrastructure; the login/registration flow that issues
// tokens lives in the auth controller (to be implemented in a later sprint).
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role, barangay_id }
    next();
  } catch (err) {
    // TokenExpiredError needs a distinct message so the client knows to
    // re-authenticate rather than treating the token as permanently invalid.
    const message = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid token.';
    return res.status(403).json({ success: false, message });
  }
};

// Like authenticate(), but never blocks. If a valid Bearer token is present it
// attaches req.user; otherwise the request proceeds anonymously (req.user
// stays undefined). Used by endpoints that anonymous citizens may call but that
// also behave differently for authenticated staff (e.g. role-scoped report
// detail — see reportController.getById).
const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Ignore an invalid/expired token here — treat the caller as anonymous
    // rather than rejecting, since auth is optional for this route.
  }
  return next();
};

module.exports = { authenticate, optionalAuthenticate };
