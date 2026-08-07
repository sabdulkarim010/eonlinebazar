const jwt = require('jsonwebtoken');

/**
 * JWT auth middleware for admin / knowledge / upload routes.
 * Sets req.agent from token payload: { id, email, role, name }
 */
function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'JWT_SECRET is not configured',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.agent = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Role guard factory — require req.agent.role to be in allowedRoles.
 * Usage: router.delete('/', authMiddleware, roleGuard(['SUPER_ADMIN', 'ADMIN']), handler)
 */
function roleGuard(allowedRoles = []) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return function roleGuardMiddleware(req, res, next) {
    if (!req.agent) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!roles.includes(req.agent.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action',
      });
    }

    next();
  };
}

module.exports = { authMiddleware, roleGuard };
