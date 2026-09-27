/********************************************************************
 * Project: EonlineBazar — Settings secret masking (API responses)
 * File: secretMasking.js
 * Description: Mask integration credentials for admin read APIs.
 *   Output format example: sk_live_••••1234
 ********************************************************************/

'use strict';

const MASK_DOT = '••••';

/**
 * @param {string} key - Plain or already-masked secret
 * @param {{ prefix?: string }} [options]
 * @returns {string}
 */
function maskSecretKey(key, options = {}) {
    const str = String(key || '').trim();
    if (!str) return '';

    if (isMaskedSecretPlaceholder(str)) return str;

    const explicitPrefix = options.prefix != null ? String(options.prefix) : '';
    let prefix = explicitPrefix;

    if (!prefix) {
        const skMatch = str.match(/^(sk_[a-z]+_)/i);
        if (skMatch) {
            prefix = skMatch[1];
        } else {
            const generic = str.match(/^([a-zA-Z][a-zA-Z0-9_]{1,12}_)/);
            prefix = generic ? generic[1] : 'sec_';
        }
    }

    const last4 = str.length >= 4 ? str.slice(-4) : MASK_DOT;
    return `${prefix}${MASK_DOT}${last4}`;
}

/**
 * True when the value is a masked placeholder from a prior API read (must not overwrite DB).
 * @param {string} value
 * @returns {boolean}
 */
function isMaskedSecretPlaceholder(value) {
    const str = String(value || '');
    if (!str) return false;
    return str.includes(MASK_DOT);
}

module.exports = {
    maskSecretKey,
    isMaskedSecretPlaceholder,
    MASK_DOT
};
