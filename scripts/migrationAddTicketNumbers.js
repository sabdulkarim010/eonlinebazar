/********************************************************************
 * Project: EonlineBazar — CRM Automation
 * File: scripts/migrationAddTicketNumbers.js
 * Description: One-time backfill for the support ticket lifecycle. Assigns a
 * unique ticketNumber (TKT-YYYY-XXXX) to every legacy ContactMessage that
 * lacks one, maps legacy statuses (unread/read/replied) onto the new
 * lifecycle (open/resolved), and ensures a default priority.
 *
 * Usage: node scripts/migrationAddTicketNumbers.js
 ********************************************************************/

require('dotenv').config();

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const ContactMessage = require('../backend/src/models/ContactMessage');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Map any legacy status value onto the new ticket lifecycle.
const LEGACY_STATUS_MAP = {
    unread: 'open',
    read: 'in_progress',
    replied: 'resolved'
};
const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

async function assignUniqueTicketNumber(doc) {
    let attempts = 0;
    while (attempts < 8) {
        const candidate = ContactMessage.buildTicketNumber(
            ContactMessage.generateTicketCode(),
            doc.createdAt || new Date()
        );
        // eslint-disable-next-line no-await-in-loop
        const clash = await ContactMessage.exists({ ticketNumber: candidate });
        if (!clash) return candidate;
        attempts += 1;
    }
    // Fallback that is effectively collision-proof.
    return ContactMessage.buildTicketNumber(
        `${ContactMessage.generateTicketCode()}${String(Date.now()).slice(-3)}`,
        doc.createdAt || new Date()
    );
}

async function main() {
    if (!MONGO_URI) {
        console.error('MONGO_URI (or MONGODB_URI) is not set. Add it to .env before running the migration.');
        process.exit(1);
    }

    console.log('\n====================================');
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    const docs = await ContactMessage.find({}).lean(false);
    console.log(`⏳ Scanning ${docs.length} contact message(s)...`);

    let numbered = 0;
    let statusFixed = 0;
    let priorityFixed = 0;

    for (const doc of docs) {
        let dirty = false;

        if (!doc.ticketNumber) {
            // eslint-disable-next-line no-await-in-loop
            doc.ticketNumber = await assignUniqueTicketNumber(doc);
            numbered += 1;
            dirty = true;
        }

        if (!VALID_STATUSES.has(doc.status)) {
            const mapped = LEGACY_STATUS_MAP[doc.status] || 'open';
            doc.status = mapped;
            if (mapped === 'resolved' && !doc.resolvedAt) {
                doc.resolvedAt = doc.repliedAt || doc.updatedAt || new Date();
            }
            statusFixed += 1;
            dirty = true;
        }

        if (!VALID_PRIORITIES.has(doc.priority)) {
            doc.priority = 'normal';
            priorityFixed += 1;
            dirty = true;
        }

        if (dirty) {
            // eslint-disable-next-line no-await-in-loop
            await doc.save();
        }
    }

    console.log(`✅ Ticket numbers added: ${numbered}`);
    console.log(`✅ Statuses migrated:    ${statusFixed}`);
    console.log(`✅ Priorities defaulted: ${priorityFixed}`);

    await mongoose.disconnect();
    console.log('🎉 Done.');
    console.log('====================================\n');
}

main().catch(async (error) => {
    console.error('\n❌ Ticket number migration failed:', error);
    try {
        await mongoose.disconnect();
    } catch {
        // ignore
    }
    process.exit(1);
});
