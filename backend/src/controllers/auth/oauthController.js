/**
 * EonlineBazar — Customer OAuth Controller
 * Extracted from: controllers/authController.js
 * Routes that use this: routes/authRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const { createCustomerLoginSession } = require('./authHelpers');

exports.getGoogleAuthStatus = (req, res) => {
    res.status(200).json({
        configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    });
};

exports.handleGoogleCallback = async (req, res, next) => {
    try {
        const user = req.user;

        if (!user) {
            return res.redirect('/login?error=google_failed');
        }

        if (user.isDeleted) {
            return res.redirect('/login?error=google_failed');
        }

        if (user.accountStatus === 'blocked') {
            return res.redirect('/login?error=google_failed');
        }
        if (user.accountStatus === 'suspended') {
            return res.redirect('/login?error=google_failed');
        }

        user.lastLogin = new Date();
        await user.save();

        const token = await createCustomerLoginSession(req, user);
        return res.redirect(`/login?token=${encodeURIComponent(token)}&google=true`);
    } catch (error) {
        console.error('Google OAuth callback error:', error);
        return res.redirect('/login?error=google_failed');
    }
};
