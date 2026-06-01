const jwt = require('jsonwebtoken');

/**
 * JWT signing utility. Token verification lives in middleware/auth.js,
 * which expects a payload of { id, role, barangay_id }.
 */
const signToken = (user) => {
  const payload = {
    id: user.user_id,
    role: user.role,
    barangay_id: user.barangay_id,  // null for citizens
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

module.exports = { signToken };