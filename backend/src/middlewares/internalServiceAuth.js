/**
 * Service-to-service auth for chat microservice and other internal callers.
 * Accepts Bearer INTERNAL_API_KEY or X-Internal-Api-Key header.
 */

function verifyInternalService(req, res, next) {
    const configured = process.env.INTERNAL_API_KEY;
    if (!configured || String(configured).trim() === '') {
        return res.status(503).json({
            success: false,
            message: 'Internal API is not configured (INTERNAL_API_KEY missing).',
        });
    }

    const bearer = req.headers.authorization || '';
    const token = bearer.startsWith('Bearer ')
        ? bearer.slice(7).trim()
        : String(req.headers['x-internal-api-key'] || '').trim();

    if (!token || token !== configured) {
        return res.status(401).json({
            success: false,
            message: 'Invalid internal service credentials.',
        });
    }

    next();
}

module.exports = { verifyInternalService };
