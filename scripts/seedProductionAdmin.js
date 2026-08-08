#!/usr/bin/env node
/**
 * Seed a production Super Admin if one does not already exist.
 *
 * Usage:
 *   node scripts/seedProductionAdmin.js
 *
 * Requires process.env.MONGODB_URI.
 * Optional: process.env.ADMIN_SEED_PASSWORD (otherwise a strong password is generated).
 */
require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');
const Admin = require('../models/admin');
const { ROLES, ACCOUNT_STATUS } = require('../config/permissions');

const ADMIN_EMAIL = 'admin@eonlinebazar.com';
const ADMIN_USERNAME = 'admin';

function generateStrongPassword(length = 24) {
    const alphabet =
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    const bytes = crypto.randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i += 1) {
        password += alphabet[bytes[i] % alphabet.length];
    }
    return password;
}

async function main() {
    const mongoUri = process.env.MONGODB_URI;

    console.log('\n====================================');
    console.log('🔐 Production Admin Seed');
    console.log('====================================\n');

    if (!mongoUri) {
        console.error('❌ MONGODB_URI is not set. Aborting.');
        process.exit(1);
    }

    try {
        console.log('⏳ Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        const existing = await Admin.findOne({ email: ADMIN_EMAIL });
        if (existing) {
            console.log(`ℹ️  Admin already exists: ${ADMIN_EMAIL}`);
            console.log(`   username : ${existing.username}`);
            console.log(`   role     : ${existing.role || ROLES.SUPER_ADMIN}`);
            console.log(`   status   : ${existing.status || ACCOUNT_STATUS.ACTIVE}`);
            console.log('\n✅ Seed complete — no changes made.');
            console.log('====================================\n');
            return;
        }

        const usernameTaken = await Admin.findOne({
            username: new RegExp(`^${ADMIN_USERNAME}$`, 'i')
        });
        if (usernameTaken) {
            console.error(
                `❌ Username "${ADMIN_USERNAME}" is already taken by another account.`
            );
            console.error('   Resolve the conflict before re-running this seed.');
            process.exit(1);
        }

        const plainPassword =
            process.env.ADMIN_SEED_PASSWORD || generateStrongPassword();

        const admin = new Admin({
            username: ADMIN_USERNAME,
            email: ADMIN_EMAIL,
            password: plainPassword,
            role: ROLES.SUPER_ADMIN,
            status: ACCOUNT_STATUS.ACTIVE,
            displayName: 'Super Admin',
            name: 'Super Admin',
            permissions: []
        });

        await admin.save();

        console.log('✅ Production admin created successfully');
        console.log(`   email    : ${admin.email}`);
        console.log(`   username : ${admin.username}`);
        console.log(`   role     : ${admin.role}`);
        console.log(`   password : ${plainPassword}`);
        console.log('\n⚠️  Save this password now — it will not be shown again.');
        console.log('   Password is stored as a bcrypt hash in the database.');
        console.log('\n✅ Seed complete.');
        console.log('====================================\n');
    } catch (err) {
        console.error('\n❌ Seed failed:', err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.connection.close().catch(() => {});
    }
}

main();
