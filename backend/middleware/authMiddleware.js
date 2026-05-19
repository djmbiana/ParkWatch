const ROLES = {
  CITIZEN: 'citizen',
  BARANGAY_OFFICIAL: 'barangay_official',
  MTPB_OFFICER: 'mtpb_officer',
  MTPB_SUPERVISOR: 'mtpb_supervisor',
  SYSTEM_ADMIN: 'system_admin',
};

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
