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
    return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }
};

module.exports = { authenticate };
