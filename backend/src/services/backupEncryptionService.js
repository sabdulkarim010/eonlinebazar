/********************************************************************
 * Encrypted backup envelope — AES-256-GCM + SHA-256 integrity
 ********************************************************************/

'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const KEY_SALT = 'eonlinebazar:backup-vault:v1';
const FORMAT_VERSION = 1;

function deriveKey(secret) {
    return crypto.scryptSync(String(secret), KEY_SALT, KEY_BYTES);
}

function resolveBackupKey() {
    const explicit = process.env.BACKUP_ENCRYPTION_KEY
        || process.env.PAYMENT_ENCRYPTION_KEY
        || process.env.ENCRYPTION_KEY
        || '';
    if (explicit) {
        return /^[0-9a-f]{64}$/i.test(explicit.trim())
            ? Buffer.from(explicit.trim(), 'hex')
            : deriveKey(explicit);
    }
    const fallback = process.env.JWT_SECRET;
    if (!fallback) {
        throw new Error('BACKUP_ENCRYPTION_KEY (or JWT_SECRET) is required for encrypted backups.');
    }
    return deriveKey(fallback);
}

function sha256Hex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * @param {Buffer} plainBuffer
 * @returns {Promise<object>} Serializable envelope (written to .eobk file)
 */
async function sealBackupPayload(plainBuffer) {
    const checksumSha256 = sha256Hex(plainBuffer);
    const compressed = await gzip(plainBuffer);
    const key = resolveBackupKey();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        formatVersion: FORMAT_VERSION,
        encryptionStandard: 'AES-256-GCM',
        algorithm: ALGORITHM,
        createdAt: new Date().toISOString(),
        checksumSha256,
        iv: iv.toString('base64url'),
        authTag: authTag.toString('base64url'),
        payloadEncoding: 'base64',
        compressed: true,
        ciphertext: ciphertext.toString('base64url')
    };
}

/**
 * @param {object} envelope
 * @returns {Promise<{ plainBuffer: Buffer, checksumMatched: boolean }>}
 */
async function openBackupEnvelope(envelope) {
    if (!envelope || envelope.formatVersion !== FORMAT_VERSION) {
        throw new Error('Unsupported or missing backup format version.');
    }

    const iv = Buffer.from(envelope.iv, 'base64url');
    const authTag = Buffer.from(envelope.authTag, 'base64url');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64url');
    const key = resolveBackupKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const compressed = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);

    const plainBuffer = envelope.compressed
        ? await gunzip(compressed)
        : compressed;

    const checksumMatched = sha256Hex(plainBuffer) === String(envelope.checksumSha256 || '');
    if (!checksumMatched) {
        throw new Error('Backup checksum mismatch — file may be corrupted or tampered.');
    }

    return { plainBuffer, checksumMatched: true };
}

function envelopeToBuffer(envelope) {
    return Buffer.from(JSON.stringify(envelope), 'utf8');
}

function parseEnvelopeBuffer(buffer) {
    const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
    return JSON.parse(text);
}

module.exports = {
    ALGORITHM,
    FORMAT_VERSION,
    sha256Hex,
    sealBackupPayload,
    openBackupEnvelope,
    envelopeToBuffer,
    parseEnvelopeBuffer,
    resolveBackupKey
};
