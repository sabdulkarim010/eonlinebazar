require('../config/loadEnv');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/jwtSecret');
const {
  resolveAgentFromRequest,
  toAgentAuthPayload,
} = require('../services/agentResolver.service');

/**
 * JWT auth middleware for admin / knowledge / upload routes.
 * Sets req.agent from resolved Agent document (chat login or store admin JWT).
 */
async function authMiddleware(req, res, next) {
  try {
    const header =
      req.headers.authorization ||
      req.headers.Authorization ||
      '';
    let token = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : String(header || '').trim();

    if (!token) {
      token =
        req.cookies?.admin_token ||
        req.cookies?.token ||
        '';
    }

    if (!token) {
      console.warn('[auth] No token — authorization header:', {
        authorization:
          req.headers.authorization || req.headers.Authorization || '(missing)',
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());
    req.agent = decoded;

    const agent = await resolveAgentFromRequest(req);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
      });
    }

    req.resolvedAgent = agent;
    req.agent = toAgentAuthPayload(agent);
    next();
  } catch (err) {
    const invalidSignature =
      err.name === 'JsonWebTokenError' && err.message === 'invalid signature';

    if (invalidSignature) {
      res.clearCookie('admin_token', { path: '/' });
    }

    console.warn('[auth] JWT verification failed — authorization header:', {
      authorization:
        req.headers.authorization || req.headers.Authorization || '(missing)',
      error: err.message,
    });
    return res.status(401).json({
      success: false,
      message: invalidSignature
        ? 'Session expired — please sign in again'
        : 'Invalid or expired token',
      code: invalidSignature ? 'JWT_SECRET_MISMATCH' : undefined,
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
