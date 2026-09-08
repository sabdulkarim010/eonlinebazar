const { loadSharedEnv } = require('./loadEnv');

loadSharedEnv();

/**
 * Single source for JWT signing and verification across chat routes, middleware, and sockets.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

module.exports = { getJwtSecret };
