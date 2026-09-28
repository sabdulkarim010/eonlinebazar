'use strict';

const DEFAULT_QUICK_ACTION_PREFERENCES = Object.freeze([
    'create-order',
    'add-product',
    'process-payout',
    'toggle-maintenance'
]);

const VALID_QUICK_ACTION_IDS = new Set([
    'create-order',
    'add-product',
    'process-payout',
    'toggle-maintenance',
    'create-coupon',
    'add-employee',
    'financial-report',
    'open-pos',
    'purchase-order',
    'support-tickets',
    'abandoned-carts',
    'manage-inventory',
    'system-backup',
    'configuration'
]);

const MAX_QUICK_ACTION_PREFERENCES = 14;

function sanitizeQuickActionPreferences(input) {
    if (!Array.isArray(input)) {
        return [...DEFAULT_QUICK_ACTION_PREFERENCES];
    }

    const seen = new Set();
    const out = [];

    input.forEach((raw) => {
        const id = String(raw || '').trim();
        if (!id || !VALID_QUICK_ACTION_IDS.has(id) || seen.has(id)) return;
        seen.add(id);
        out.push(id);
    });

    if (!out.length) {
        return [...DEFAULT_QUICK_ACTION_PREFERENCES];
    }

    return out.slice(0, MAX_QUICK_ACTION_PREFERENCES);
}

module.exports = {
    DEFAULT_QUICK_ACTION_PREFERENCES,
    VALID_QUICK_ACTION_IDS,
    MAX_QUICK_ACTION_PREFERENCES,
    sanitizeQuickActionPreferences
};
