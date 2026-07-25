/********************************************************************
 * Project: EonlineBazar — Role Based Access Control
 * File: rbac.js
 * Location: middlewares/rbac.js
 * Author: Abdul Karim Sheikh
 * Description: Dynamic permission guards for the admin panel.
 *   • checkPermission('manage_orders')  → super admin bypasses, staff must hold it
 *   • requireSuperAdmin                 → owner-only routes (staff management)
 *   • attachAdminAccount                → loads the live account behind a token
 *
 * Every guard reads the account straight from MongoDB (loaded by verifyAdmin)
 * instead of trusting the JWT payload, so revoking a permission or blocking an
 * account takes effect on the very next request — no re-login required.
 ********************************************************************/

const Admin = require('../models/admin');
const AdminSession = require('../models/adminSession');
const { ROLES, ACCOUNT_STATUS } = require('../config/permissions');

const ACCESS_DENIED_PATH = '/admin/access-denied';
const LOGIN_PATH = '/admin-login';

/**
 * Browser page navigations get redirected to the Access Denied view; API
 * calls (the admin panel is a fetch-driven SPA) get a clean 403 JSON body.
 */
function wantsHtml(req) {
    if (req.xhr) return false;
    if (req.originalUrl.startsWith('/api/')) return false;
    const accept = String(req.headers.accept || '');
    return accept.includes('text/html');
}

function denyAccess(req, res, { message, permission = null, status = 403 }) {
    if (wantsHtml(req)) {
        const target = permission
            ? `${ACCESS_DENIED_PATH}?permission=${encodeURIComponent(permission)}`
            : ACCESS_DENIED_PATH;
        return res.redirect(target);
    }

    return res.status(status).json({
        success: false,
        message,
        reason: 'PERMISSION_DENIED',
        requiredPermission: permission,
        redirect: ACCESS_DENIED_PATH
    });
}

/**
 * Load the live Admin document for an already-verified token and reject
 * deleted or blocked accounts. Called by verifyAdmin, so `req.adminAccount`
 * is available to every protected route and controller.
 */
async function attachAdminAccount(req, res, decoded) {
    const username = decoded && decoded.username;
    if (!username) {
        res.status(401).json({
            success: false,
            message: 'Malformed admin token. Please log in again.',
            redirect: LOGIN_PATH
        });
        return null;
    }

    const account = await Admin.findOne({ username });

    if (!account) {
        // The account was deleted while its token was still alive.
        await AdminSession.deleteMany({ adminUsername: username });
        res.status(401).json({
            success: false,
            message: 'This admin account no longer exists. Please log in again.',
            redirect: LOGIN_PATH
        });
        return null;
    }

    if (account.isBlocked()) {
        // Instant suspension: kill every device the moment a blocked account
        // makes a request, so revoking access never waits for token expiry.
        await AdminSession.deleteMany({ adminUsername: username });
        res.status(403).json({
            success: false,
            message: 'Your account has been blocked by the Super Admin. Contact the store owner.',
            reason: 'ACCOUNT_BLOCKED',
            redirect: LOGIN_PATH
        });
        return null;
    }

    req.adminAccount = account;
    req.admin = {
        ...decoded,
        id: account._id,
        username: account.username,
        role: account.role || ROLES.SUPER_ADMIN,
        permissions: Array.isArray(account.permissions) ? account.permissions : [],
        status: account.status || ACCOUNT_STATUS.ACTIVE,
        isSuperAdmin: account.isSuperAdmin(),
        displayName: account.name || account.displayName || account.username
    };

    return account;
}

/**
 * Guard a route with one or more permissions. Passing several keys means
 * "any of these is enough" — e.g. checkPermission('manage_inventory', 'manage_catalog').
 *
 * Must run after verifyAdmin.
 */
function checkPermission(...required) {
    const wanted = required.flat().filter(Boolean);

    return function permissionGuard(req, res, next) {
        const account = req.adminAccount;

        if (!account) {
            return res.status(401).json({
                success: false,
                message: 'Admin session could not be verified. Please log in again.',
                redirect: LOGIN_PATH
            });
        }

        // Super Admin bypasses every check — full access, always.
        if (account.isSuperAdmin()) return next();

        if (wanted.length === 0) return next();

        const granted = wanted.some(permission => account.hasPermission(permission));
        if (granted) return next();

        return denyAccess(req, res, {
            permission: wanted[0],
            message: `Access denied. You do not have the "${wanted[0]}" permission. Contact the Super Admin if you need it.`
        });
    };
}

/** Owner-only routes: staff accounts can never reach these, whatever their permissions. */
function requireSuperAdmin(req, res, next) {
    const account = req.adminAccount;

    if (!account) {
        return res.status(401).json({
            success: false,
            message: 'Admin session could not be verified. Please log in again.',
            redirect: LOGIN_PATH
        });
    }

    if (account.isSuperAdmin()) return next();

    return denyAccess(req, res, {
        message: 'Access denied. This action is restricted to the Super Admin.'
    });
}

module.exports = {
    attachAdminAccount,
    checkPermission,
    requireSuperAdmin,
    denyAccess,
    ACCESS_DENIED_PATH
};
