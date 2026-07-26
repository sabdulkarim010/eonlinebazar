/********************************************************************
 * Project: EonlineBazar
 * File: cryptoVault.js
 * Location: utils/cryptoVault.js
 * Author: Abdul Karim Sheikh
 * Description: Authenticated symmetric encryption (AES-256-GCM) for
 * payment gateway credentials. Gateway secrets must be reversible — the
 * server has to replay the real store password to SSLCommerz/Aamarpay —
 * so hashing is not an option; they are sealed at rest instead.
 ********************************************************************/

const crypto = require('crypto');

const CIPHER_ALGO = 'aes-256-gcm';
const ENVELOPE_PREFIX = 'pmv1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

// Derivation salt is a constant, not a secret: it only separates this key
// from any other scrypt key derived out of the same master secret.
const KEY_DERIVATION_SALT = 'eonlinebazar:payment-vault:v1';

let cachedKey = null;
let warnedAboutDerivedKey = false;

function deriveKey(secret) {
    return crypto.scryptSync(String(secret), KEY_DERIVATION_SALT, KEY_BYTES);
}

/**
 * Key resolution order:
 *   1. PAYMENT_ENCRYPTION_KEY / ENCRYPTION_KEY as 64 hex chars — used verbatim.
 *   2. Either variable as a passphrase — stretched with scrypt.
 *   3. JWT_SECRET — stretched with scrypt, with a startup warning.
 * Rotating the key makes previously sealed credentials unreadable, so they
 * must be re-entered in the Admin Panel after a rotation.
 */
function resolveKey() {
    if (cachedKey) return cachedKey;

    const explicit = process.env.PAYMENT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';
    if (explicit) {
        cachedKey = /^[0-9a-f]{64}$/i.test(explicit.trim())
            ? Buffer.from(explicit.trim(), 'hex')
            : deriveKey(explicit);
        return cachedKey;
    }

    const fallback = process.env.JWT_SECRET;
    if (!fallback) {
        throw new Error(
            'Payment credential encryption requires PAYMENT_ENCRYPTION_KEY (or at least JWT_SECRET) in the environment.'
        );
    }

    if (!warnedAboutDerivedKey) {
        warnedAboutDerivedKey = true;
        console.warn(
            '🔐 PAYMENT_ENCRYPTION_KEY is not set — gateway credentials are sealed with a key derived from JWT_SECRET. '
            + 'Set a dedicated 64-hex-character PAYMENT_ENCRYPTION_KEY so rotating the JWT secret does not lock out payment credentials.'
        );
    }

    cachedKey = deriveKey(fallback);
    return cachedKey;
}

function hasDedicatedEncryptionKey() {
    return Boolean(process.env.PAYMENT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY);
}

function isEncryptedEnvelope(value) {
    return typeof value === 'string' && value.startsWith(`${ENVELOPE_PREFIX}.`);
}

/** Seals a plaintext secret. Empty input stays empty so "not configured" round-trips cleanly. */
function encryptSecret(plainText) {
    const plain = plainText === undefined || plainText === null ? '' : String(plainText);
    if (!plain) return '';
    if (isEncryptedEnvelope(plain)) return plain;

    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(CIPHER_ALGO, resolveKey(), iv);
    const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
        ENVELOPE_PREFIX,
        iv.toString('base64url'),
        authTag.toString('base64url'),
        sealed.toString('base64url')
    ].join('.');
}

/**
 * Opens a sealed secret. Returns '' when the envelope is missing, malformed,
 * or fails authentication — callers treat that as "gateway not configured"
 * rather than crashing a live checkout.
 */
function decryptSecret(envelope) {
    if (!envelope || typeof envelope !== 'string') return '';
    if (!isEncryptedEnvelope(envelope)) return envelope;

    const [, ivPart, tagPart, payloadPart] = envelope.split('.');
    if (!ivPart || !tagPart || !payloadPart) {
        console.error('Payment vault: malformed credential envelope.');
        return '';
    }

    try {
        const authTag = Buffer.from(tagPart, 'base64url');
        if (authTag.length !== AUTH_TAG_BYTES) throw new Error('Bad auth tag length.');

        const decipher = crypto.createDecipheriv(CIPHER_ALGO, resolveKey(), Buffer.from(ivPart, 'base64url'));
        decipher.setAuthTag(authTag);

        return Buffer.concat([
            decipher.update(Buffer.from(payloadPart, 'base64url')),
            decipher.final()
        ]).toString('utf8');
    } catch (error) {
        console.error('Payment vault: credential could not be decrypted (wrong key or tampered value).');
        return '';
    }
}

/** Display helper — never send a full gateway secret back to a browser. */
function maskSecret(envelopeOrPlain, { visible = 4 } = {}) {
    const plain = decryptSecret(envelopeOrPlain);
    if (!plain) return '';
    if (plain.length <= visible) return '•'.repeat(plain.length);
    return `${'•'.repeat(Math.min(12, plain.length - visible))}${plain.slice(-visible)}`;
}

module.exports = {
    encryptSecret,
    decryptSecret,
    isEncryptedEnvelope,
    maskSecret,
    hasDedicatedEncryptionKey
};
