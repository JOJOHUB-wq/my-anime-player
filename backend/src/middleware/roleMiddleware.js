function roleMiddleware(allowedRoles = []) {
  return function enforceRole(req, res, next) {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required.',
      });
      return;
    }

    if (req.user.is_guest) {
      res.status(403).json({
        error: 'Guest accounts cannot access this resource.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions.',
      });
      return;
    }

    next();
  };
}

module.exports = {
  roleMiddleware,
};
