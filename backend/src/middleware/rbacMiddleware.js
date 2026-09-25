/********************************************************************
 * Project: EonlineBazar — Scope-Based RBAC
 * File: rbacMiddleware.js
 * Location: middlewares/rbacMiddleware.js
 * Description: Fine-grained scope permissions mapped to legacy keys.
 *   e.g. products:read → view_products, inventory:manage → manage_stock
 ********************************************************************/

'use strict';

const { checkPermission, denyAccess, attachAdminAccount } = require('../middlewares/rbac');
const { accountHasPermission } = require('../config/permissions');

/**
 * Scope → legacy permission keys (any match grants access).
 */
const SCOPE_PERMISSION_MAP = Object.freeze({
    'products:read': ['view_products', 'manage_inventory'],
    'products:create': ['edit_products', 'manage_inventory'],
    'products:edit': ['edit_products', 'manage_inventory'],
    'products:delete': ['edit_products', 'manage_inventory'],
    'inventory:manage': ['manage_stock', 'manage_inventory', 'manage_warehouses'],
    'transfers:approve': ['transfers_approve', 'manage_warehouses', 'manage_inventory'],
    'pim:read': ['view_products', 'manage_inventory'],
    'pim:manage': ['edit_products', 'manage_pim', 'manage_inventory'],
    'import:run': ['edit_products', 'manage_inventory'],
    'export:run': ['view_products', 'manage_inventory'],
    'outbox:read': ['manage_security', 'manage_inventory'],
    'jobs:read': ['view_products', 'edit_products', 'manage_inventory']
});

function resolveScopePermissions(scope) {
    const key = String(scope || '').trim().toLowerCase();
    if (!key) return [];
    if (SCOPE_PERMISSION_MAP[key]) return SCOPE_PERMISSION_MAP[key];
    return [key];
}

function accountHasScope(account, scope) {
    if (!account) return false;
    if (typeof account.isSuperAdmin === 'function' && account.isSuperAdmin()) return true;

    const legacyKeys = resolveScopePermissions(scope);
    return legacyKeys.some((permission) => accountHasPermission(account, permission));
}

/**
 * Guard route with one or more scope permissions (any scope match is enough).
 * Must run after verifyAdmin.
 */
function checkScopePermission(...scopes) {
    const wanted = scopes.flat().filter(Boolean);

    return function scopePermissionGuard(req, res, next) {
        const account = req.adminAccount;

        if (!account) {
            return res.status(401).json({
                success: false,
                message: 'Admin session could not be verified. Please log in again.'
            });
        }

        if (account.isSuperAdmin()) return next();
        if (!wanted.length) return next();

        const allowed = wanted.some((scope) => accountHasScope(account, scope));
        if (allowed) return next();

        return denyAccess(req, res, {
            permission: wanted[0],
            message: `Access denied. Missing scope permission "${wanted[0]}".`
        });
    };
}

/** Bridge helper — map scopes to legacy checkPermission middleware. */
function checkScopeOrLegacy(...scopes) {
    const legacy = scopes.flatMap((scope) => resolveScopePermissions(scope));
    const unique = [...new Set(legacy)];
    return checkPermission(...unique);
}

module.exports = {
    SCOPE_PERMISSION_MAP,
    resolveScopePermissions,
    accountHasScope,
    checkScopePermission,
    checkScopeOrLegacy,
    attachAdminAccount
};
