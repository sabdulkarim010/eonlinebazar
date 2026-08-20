//File Name: models/admin.js



const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, ROLE_VALUES, ACCOUNT_STATUS, STATUS_VALUES } = require('../config/permissions');

const BCRYPT_ROUNDS = 12;

// Matches any bcrypt digest ($2a$ / $2b$ / $2y$) so we never double-hash and
// can detect legacy plaintext passwords written before hashing existed.
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// অ্যাডমিন ডাটাবেজ স্ট্রাকচার (মার্জড ও আপডেট করা সংস্করণ)
const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true // ইউজারনেমের আগে-পরে স্পেস থাকলে তা অটোমেটিক কেটে যাবে
    },
    password: {
        type: String,
        required: true
    },
    // Human-readable staff name shown in the staff table (falls back to displayName)
    name: {
        type: String,
        default: '',
        trim: true
    },

    // ============================================================
    // 🛡️ ROLE BASED ACCESS CONTROL
    // ============================================================
    // 'superadmin' → unrestricted owner account (bypasses every permission check)
    // 'staff'      → limited operator, may only do what `permissions` allows
    //
    // The default is intentionally 'superadmin': documents created before RBAC
    // existed have no `role` field, and Mongoose applies defaults when it
    // hydrates them. Defaulting to 'staff' would silently strip the owner's
    // access. Staff accounts always set the role explicitly at creation.
    role: {
        type: String,
        enum: ROLE_VALUES,
        default: ROLES.SUPER_ADMIN,
        index: true
    },
    permissions: {
        type: [String],
        default: []
    },
    // 'blocked' suspends the account instantly — login is refused and every
    // live session is revoked on the next authenticated request.
    status: {
        type: String,
        enum: STATUS_VALUES,
        default: ACCOUNT_STATUS.ACTIVE,
        index: true
    },
    // Username of the super admin who created this staff account
    createdBy: {
        type: String,
        default: '',
        trim: true
    },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    // 🔐 2FA / OTP ডেলিভারির জন্য অ্যাডমিন ইমেইল (খালি থাকলে SMTP_USER / EMAIL_USER-এ পাঠানো হয়)
    email: {
        type: String,
        default: '',
        trim: true,
        lowercase: true
    },
    // 📱 Phone number used for SMS-based 2FA (E.164 format e.g. +8801XXXXXXXXX)
    phone: {
        type: String,
        default: '',
        trim: true
    },

    // ============================================================
    // 🔐 MULTI-OPTION TWO-FACTOR AUTHENTICATION
    // ============================================================
    // Admin-selectable 2FA delivery preference:
    //   'email' → one-time code emailed via Nodemailer (default)
    //   'totp'  → Google Authenticator / Authy time-based code (speakeasy)
    //   'sms'   → one-time code delivered via SMS gateway (placeholder)
    twoFactorMethod: {
        type: String,
        enum: ['email', 'totp', 'sms'],
        default: 'email'
    },
    // Master switch — if false, login completes right after password (no 2nd step)
    twoFactorEnabled: {
        type: Boolean,
        default: true
    },

    // — Email / SMS OTP challenge —
    // otp = 6-digit String; otpExpiry = Date.now() + TTL (UTC epoch ms — timezone-independent)
    otp: { type: String, default: null, select: false },
    otpExpiry: { type: Number, default: null, select: false },

    // — Google Authenticator (TOTP via speakeasy) —
    // base32 shared secret; never exposed in normal queries (select: false)
    totpSecret: { type: String, default: null, select: false },
    // Pending (unconfirmed) secret held during the "scan QR → verify once" setup step
    totpPendingSecret: { type: String, default: null, select: false },
    // Only true after the admin proves they scanned the QR by entering a valid code
    totpVerified: { type: Boolean, default: false },

    // — SMS setup verification (self-service "send test code → verify" step) —
    // Distinct from the login OTP (otp/otpExpiry) so an in-progress SMS setup can
    // never collide with an active login challenge. Epoch-ms expiry, timezone-safe.
    smsSetupOtp: { type: String, default: null, select: false },
    smsSetupOtpExpiry: { type: Number, default: null, select: false },
    image: { 
        type: String, 
        default: '' // প্রোফাইল ছবির ক্লাউডিনারি URL এখানে সেভ হবে
    },
    displayName: { type: String, default: 'Super Admin', trim: true },
    storeName: { type: String, default: 'EonlineBazar', trim: true },
    currency: { type: String, default: 'BDT', trim: true },
    currencySymbol: { type: String, default: '৳', trim: true },
    timezone: { type: String, default: 'Asia/Dhaka', trim: true },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' }
}, { timestamps: true }); // এটি অটোমেটিক অ্যাকাউন্ট তৈরি ও আপডেটের সময় রেকর্ড রাখবে

// ============================================================
// 🔐 PASSWORD SECURITY
// ============================================================

/** True when the given value is already a bcrypt digest. */
function isHashed(value) {
    return BCRYPT_PATTERN.test(String(value || ''));
}

// Hash on every write unless the value is already a digest — assigning a plain
// password anywhere (login bootstrap, staff creation, password reset, profile
// update) is enough to get it stored securely.
// Mongoose 9 does not pass `next` to async hooks — returning resolves the hook
// and a thrown error aborts the save.
adminSchema.pre('save', async function hashPassword() {
    if (!this.isModified('password')) return;
    if (isHashed(this.password)) return;

    this.password = await bcrypt.hash(String(this.password), BCRYPT_ROUNDS);
    this.passwordChangedAt = new Date();
});

adminSchema.methods.isPasswordHashed = function isPasswordHashed() {
    return isHashed(this.password);
};

/**
 * Verify a candidate password against the stored value.
 * Accounts created before hashing existed still hold plaintext; those are
 * compared in constant time and transparently upgraded by the login flow.
 */
adminSchema.methods.verifyPassword = async function verifyPassword(candidate) {
    const stored = String(this.password || '');
    const plain = String(candidate || '');
    if (!stored || !plain) return false;

    if (isHashed(stored)) {
        return bcrypt.compare(plain, stored);
    }

    const storedBuf = Buffer.from(stored);
    const plainBuf = Buffer.from(plain);
    if (storedBuf.length !== plainBuf.length) return false;
    return crypto.timingSafeEqual(storedBuf, plainBuf);
};

// ============================================================
// 🛡️ ROLE HELPERS
// ============================================================

adminSchema.methods.isSuperAdmin = function isSuperAdmin() {
    return (this.role || ROLES.SUPER_ADMIN) === ROLES.SUPER_ADMIN;
};

adminSchema.methods.isBlocked = function isBlocked() {
    return this.status === ACCOUNT_STATUS.BLOCKED;
};

/** Super admins bypass every check; staff must hold the exact permission. */
adminSchema.methods.hasPermission = function hasPermission(permission) {
    if (this.isSuperAdmin()) return true;
    if (!permission) return true;
    return Array.isArray(this.permissions) && this.permissions.includes(permission);
};

/** Account shape safe to send to the browser (never includes secrets). */
adminSchema.methods.toSafeObject = function toSafeObject() {
    return {
        id: this._id,
        username: this.username,
        name: this.name || this.displayName || this.username,
        displayName: this.displayName || '',
        email: this.email || '',
        phone: this.phone || '',
        role: this.role || ROLES.SUPER_ADMIN,
        permissions: Array.isArray(this.permissions) ? this.permissions : [],
        status: this.status || ACCOUNT_STATUS.ACTIVE,
        image: this.image || '',
        twoFactorEnabled: this.twoFactorEnabled !== false,
        twoFactorMethod: this.twoFactorMethod || 'email',
        createdBy: this.createdBy || '',
        lastLoginAt: this.lastLoginAt || null,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

/**
 * Backfill RBAC fields on documents written before this engine existed so
 * queries that filter by role/status (store branding, staff listing) behave
 * predictably. Safe to run on every boot — it only touches missing fields.
 */
adminSchema.statics.ensureRbacDefaults = async function ensureRbacDefaults() {
    const [roleResult, statusResult] = await Promise.all([
        this.updateMany(
            { role: { $exists: false } },
            { $set: { role: ROLES.SUPER_ADMIN, permissions: [] } }
        ),
        this.updateMany(
            { status: { $exists: false } },
            { $set: { status: ACCOUNT_STATUS.ACTIVE } }
        )
    ]);

    return {
        rolesBackfilled: roleResult.modifiedCount || 0,
        statusBackfilled: statusResult.modifiedCount || 0
    };
};

module.exports = mongoose.model('Admin', adminSchema);




