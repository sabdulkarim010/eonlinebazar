/********************************************************************
 * Project: EonlineBazar — Staff Management (Super Admin only)
 * File: staffController.js
 * Location: controllers/staffController.js
 * Author: Abdul Karim Sheikh
 * Description: Full lifecycle management of staff accounts:
 *   • list / create staff with a dynamic permission set
 *   • update details & permissions (applies on their next request)
 *   • block ⇄ activate instantly (kills every live session)
 *   • reset password (kills every live session)
 *   • delete the account permanently (record + access gone)
 *
 * Every mutation is written to the security log and can only be reached by a
 * Super Admin — see routes/staffRoutes.js.
 ********************************************************************/

const crypto = require('crypto');
const mongoose = require('mongoose');

const Admin = require('../models/admin');
const AdminSession = require('../models/adminSession');
const {
    ROLES,
    ACCOUNT_STATUS,
    getPermissionCatalog,
    sanitizePermissions,
    SECTION_PERMISSIONS
} = require('../config/permissions');
const { fingerprint } = require('../utils/deviceParser');
const { logSecurityEvent } = require('../utils/securityLogger');

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function clientIp(req) {
    try {
        return fingerprint(req).ipAddress;
    } catch (err) {
        return req.clientIp || req.ip || 'Unknown';
    }
}

/** Revoke every device signed into an account (used on block / reset / delete). */
async function revokeAllSessions(username) {
    const result = await AdminSession.deleteMany({ adminUsername: username });
    return result.deletedCount || 0;
}

/**
 * Load a staff account by id. Super Admin accounts are deliberately out of
 * reach here — the owner is managed from Admin Settings, never from this table,
 * so a compromised staff-management call can't demote or delete the owner.
 */
async function findStaffById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const account = await Admin.findById(id);
    if (!account || account.isSuperAdmin()) return null;
    return account;
}

function generatePassword() {
    // 12 URL-safe characters — enough entropy for a temporary hand-off password.
    return crypto.randomBytes(9).toString('base64url');
}

/* ==================================================================
   GET /api/admin/permissions — catalog for the staff form + UI gating
   Available to any signed-in admin: staff need it to know which
   sidebar sections to render.
   ================================================================== */
exports.getPermissionCatalogue = async (req, res) => {
    res.status(200).json({
        success: true,
        permissions: getPermissionCatalog(),
        sectionPermissions: SECTION_PERMISSIONS,
        roles: ROLES
    });
};

/* ==================================================================
   GET /api/admin/me — who am I, and what may I do?
   ================================================================== */
exports.getCurrentAdmin = async (req, res) => {
    const account = req.adminAccount;
    if (!account) {
        return res.status(401).json({ success: false, message: 'Admin session could not be verified.' });
    }
    res.status(200).json({ success: true, admin: account.toSafeObject() });
};

/* ==================================================================
   GET /api/admin/staff — staff list + summary counters
   ================================================================== */
exports.listStaff = async (req, res) => {
    try {
        const staff = await Admin.find({ role: ROLES.STAFF }).sort({ createdAt: -1 });

        const data = staff.map(member => member.toSafeObject());
        const summary = {
            total: data.length,
            active: data.filter(s => s.status === ACCOUNT_STATUS.ACTIVE).length,
            blocked: data.filter(s => s.status === ACCOUNT_STATUS.BLOCKED).length
        };

        res.status(200).json({ success: true, summary, data });
    } catch (error) {
        console.error('List Staff Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load staff accounts.' });
    }
};

/* ==================================================================
   POST /api/admin/staff — create a staff account
   Body: { name, username, email, password, permissions[], requireTwoFactor }
   ================================================================== */
exports.createStaff = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const username = String(req.body.username || '').trim().toLowerCase();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const permissions = sanitizePermissions(req.body.permissions);
        const requireTwoFactor = req.body.requireTwoFactor === true || req.body.requireTwoFactor === 'true';

        if (!name) {
            return res.status(400).json({ success: false, message: 'Staff name is required.' });
        }
        if (!USERNAME_PATTERN.test(username)) {
            return res.status(400).json({
                success: false,
                message: 'Username must be 3–30 characters using lowercase letters, numbers, dot, dash, or underscore.'
            });
        }
        if (!EMAIL_PATTERN.test(email)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
            });
        }
        if (permissions.length === 0) {
            return res.status(400).json({ success: false, message: 'Select at least one permission for this staff member.' });
        }

        // Case-insensitive uniqueness: 'Rahim' and 'rahim' must never coexist.
        const usernameTaken = await Admin.findOne({ username: new RegExp(`^${username}$`, 'i') });
        if (usernameTaken) {
            return res.status(409).json({ success: false, message: 'That username is already taken.' });
        }

        const emailTaken = await Admin.findOne({ email });
        if (emailTaken) {
            return res.status(409).json({ success: false, message: 'That email is already used by another admin account.' });
        }

        // role/status are set here, never taken from the request body — no
        // request can promote itself to Super Admin.
        const staff = new Admin({
            username,
            password,
            name,
            displayName: name,
            email,
            role: ROLES.STAFF,
            status: ACCOUNT_STATUS.ACTIVE,
            permissions,
            createdBy: req.adminAccount.username,
            // Email OTP on every login is optional: leaving it off means a new
            // staff member can sign in even before SMTP is configured.
            twoFactorEnabled: requireTwoFactor,
            twoFactorMethod: 'email'
        });

        await staff.save();

        await logSecurityEvent({
            action: 'Staff Account Created',
            actor: req.adminAccount.username,
            actorType: 'admin',
            ipAddress: clientIp(req),
            details: `Created staff "${username}" with permissions: ${permissions.join(', ')}`
        });

        res.status(201).json({
            success: true,
            message: `Staff account "${username}" created successfully.`,
            data: staff.toSafeObject()
        });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({ success: false, message: 'That username is already taken.' });
        }
        console.error('Create Staff Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create staff account.' });
    }
};

/* ==================================================================
   PUT /api/admin/staff/:id — update name, email, and permissions
   ================================================================== */
exports.updateStaff = async (req, res) => {
    try {
        const staff = await findStaffById(req.params.id);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff account not found.' });
        }

        const changes = [];

        if (req.body.name !== undefined) {
            const name = String(req.body.name).trim();
            if (!name) {
                return res.status(400).json({ success: false, message: 'Staff name cannot be empty.' });
            }
            if (name !== staff.name) changes.push('name');
            staff.name = name;
            staff.displayName = name;
        }

        if (req.body.email !== undefined) {
            const email = String(req.body.email).trim().toLowerCase();
            if (!EMAIL_PATTERN.test(email)) {
                return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
            }
            if (email !== staff.email) {
                const emailTaken = await Admin.findOne({ email, _id: { $ne: staff._id } });
                if (emailTaken) {
                    return res.status(409).json({ success: false, message: 'That email is already used by another admin account.' });
                }
                changes.push('email');
            }
            staff.email = email;
        }

        if (req.body.permissions !== undefined) {
            const permissions = sanitizePermissions(req.body.permissions);
            if (permissions.length === 0) {
                return res.status(400).json({ success: false, message: 'A staff member must keep at least one permission.' });
            }
            changes.push(`permissions → ${permissions.join(', ')}`);
            staff.permissions = permissions;
        }

        if (req.body.requireTwoFactor !== undefined) {
            const requireTwoFactor = req.body.requireTwoFactor === true || req.body.requireTwoFactor === 'true';
            if (requireTwoFactor !== (staff.twoFactorEnabled !== false)) {
                changes.push(`2FA ${requireTwoFactor ? 'enabled' : 'disabled'}`);
            }
            staff.twoFactorEnabled = requireTwoFactor;
        }

        await staff.save();

        await logSecurityEvent({
            action: 'Staff Account Updated',
            actor: req.adminAccount.username,
            actorType: 'admin',
            ipAddress: clientIp(req),
            details: `Updated staff "${staff.username}" — ${changes.length ? changes.join(' · ') : 'no field changes'}`
        });

        res.status(200).json({
            success: true,
            message: `Staff account "${staff.username}" updated. New permissions apply immediately.`,
            data: staff.toSafeObject()
        });
    } catch (error) {
        console.error('Update Staff Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update staff account.' });
    }
};

/* ==================================================================
   PATCH /api/admin/staff/:id/status — block ⇄ activate instantly
   Body: { status: 'active' | 'blocked' }  (omit to toggle)
   ================================================================== */
exports.updateStaffStatus = async (req, res) => {
    try {
        const staff = await findStaffById(req.params.id);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff account not found.' });
        }

        const requested = String(req.body.status || '').trim().toLowerCase();
        let nextStatus;

        if (!requested) {
            nextStatus = staff.isBlocked() ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.BLOCKED;
        } else if (requested === ACCOUNT_STATUS.ACTIVE || requested === ACCOUNT_STATUS.BLOCKED) {
            nextStatus = requested;
        } else {
            return res.status(400).json({ success: false, message: "Status must be either 'active' or 'blocked'." });
        }

        staff.status = nextStatus;
        await staff.save();

        // Blocking must take effect right now, not when the token expires.
        const revoked = nextStatus === ACCOUNT_STATUS.BLOCKED ? await revokeAllSessions(staff.username) : 0;

        await logSecurityEvent({
            action: nextStatus === ACCOUNT_STATUS.BLOCKED ? 'Staff Account Blocked' : 'Staff Account Activated',
            actor: req.adminAccount.username,
            actorType: 'admin',
            ipAddress: clientIp(req),
            details: nextStatus === ACCOUNT_STATUS.BLOCKED
                ? `Suspended "${staff.username}" and signed out ${revoked} device(s)`
                : `Restored access for "${staff.username}"`
        });

        res.status(200).json({
            success: true,
            message: nextStatus === ACCOUNT_STATUS.BLOCKED
                ? `"${staff.username}" is now blocked and has been signed out of ${revoked} device(s).`
                : `"${staff.username}" is active again and can sign in.`,
            data: staff.toSafeObject(),
            revokedSessions: revoked
        });
    } catch (error) {
        console.error('Update Staff Status Error:', error);
        res.status(500).json({ success: false, message: 'Failed to change staff status.' });
    }
};

/* ==================================================================
   POST /api/admin/staff/:id/reset-password
   Body: { newPassword }  (omit to have a strong one generated)
   ================================================================== */
exports.resetStaffPassword = async (req, res) => {
    try {
        const staff = await findStaffById(req.params.id);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff account not found.' });
        }

        const provided = String(req.body.newPassword || '').trim();
        if (provided && provided.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
            });
        }

        const newPassword = provided || generatePassword();
        staff.password = newPassword; // hashed by the model's pre-save hook
        await staff.save();

        // Old sessions must die with the old password.
        const revoked = await revokeAllSessions(staff.username);

        await logSecurityEvent({
            action: 'Staff Password Reset',
            actor: req.adminAccount.username,
            actorType: 'admin',
            ipAddress: clientIp(req),
            details: `Reset password for "${staff.username}" and signed out ${revoked} device(s)`
        });

        res.status(200).json({
            success: true,
            message: `Password reset for "${staff.username}". They have been signed out of all devices.`,
            // Returned once so the Super Admin can hand it over; never stored in plain text.
            generatedPassword: provided ? undefined : newPassword,
            revokedSessions: revoked
        });
    } catch (error) {
        console.error('Reset Staff Password Error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset the staff password.' });
    }
};

/* ==================================================================
   DELETE /api/admin/staff/:id — remove the record and all access
   ================================================================== */
exports.deleteStaff = async (req, res) => {
    try {
        const staff = await findStaffById(req.params.id);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff account not found.' });
        }

        const { username } = staff;
        const revoked = await revokeAllSessions(username);
        await staff.deleteOne();

        await logSecurityEvent({
            action: 'Staff Account Deleted',
            actor: req.adminAccount.username,
            actorType: 'admin',
            ipAddress: clientIp(req),
            details: `Permanently deleted staff "${username}" and revoked ${revoked} session(s)`
        });

        res.status(200).json({
            success: true,
            message: `Staff account "${username}" has been permanently deleted.`,
            revokedSessions: revoked
        });
    } catch (error) {
        console.error('Delete Staff Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete the staff account.' });
    }
};
