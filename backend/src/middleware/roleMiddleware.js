// Role values must match the `role` ENUM in src/config/schema.sql (USERS table).
const ROLES = {
  CITIZEN: 'citizen',
  BRGY_OFFICIAL: 'brgy_official',
  MTPB_OFFICER: 'mtpb_officer',
  MTPB_SUPERVISOR: 'mtpb_supervisor',
  ADMIN: 'admin',
};

// Guards a route so only the listed roles may access it. Use after authenticate().
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}.`,
      });
    }

    next();
  };
};

module.exports = { authorize, ROLES };
