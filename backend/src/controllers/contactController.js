/********************************************************************
 * Project: EonlineBazar
 * File: contactController.js
 ********************************************************************/

const ContactMessage = require('../models/ContactMessage');
const { TICKET_STATUSES, TICKET_PRIORITIES } = require('../models/ContactMessage');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { dualWrite } = require('../services/dualWriteService');
const {
    fetchContactMessagesInbox,
    fetchTicketStats
} = require('../services/marketingSupportReadService');

function getContactMessageRepository() {
    return require('../repositories/contactMessageRepository');
}

async function mirrorContactMessage(saved) {
    await getContactMessageRepository().upsertFromMongo(saved);
}

async function saveContactMessage(doc, operation) {
    return dualWrite(
        () => doc.save(),
        async (saved) => { await mirrorContactMessage(saved); },
        {
            model: 'ContactMessage',
            operation,
            mongoId: (saved) => String(saved._id)
        }
    );
}
const { sendInquiryReplyEmail } = require('../services/mailer');
const { getStoreSettings } = require('../services/storeSettingsService');
const { emitToAdmins } = require('../services/socketService');

const CLOSED_TICKET_STATUSES = ['resolved', 'closed'];

function readString(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

const submitContactMessage = async (req, res) => {
    try {
        const body = req.body || {};
        const name = readString(body.name, 80);
        const email = readString(body.email, 120).toLowerCase();
        const phone = readString(body.phone, 20);
        const subject = readString(body.subject, 120);
        const message = readString(body.message, 5000);

        if (name.length < 2) {
            return res.status(400).json({ success: false, message: 'Please enter your name (at least 2 characters).' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
        }

        if (message.length < 10) {
            return res.status(400).json({ success: false, message: 'Message must be at least 10 characters.' });
        }

        const doc = await dualWrite(
            () => ContactMessage.create({ name, email, phone, subject, message }),
            async (saved) => { await mirrorContactMessage(saved); },
            {
                model: 'ContactMessage',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

        emitToAdmins('new_message', {
            messageId: doc._id,
            senderName: doc.name,
            subject: doc.subject,
            createdAt: doc.createdAt
        });

        await logSecurityEvent({
            actor: email,
            actorType: 'customer',
            action: 'Contact Form Submitted',
            ipAddress: getClientIp(req),
            details: `Contact inquiry from ${name}${subject ? ` — ${subject}` : ''}`
        });

        res.status(201).json({
            success: true,
            message: 'Thank you! Your message has been sent. Our team will respond soon.',
            data: { id: String(doc._id) }
        });
    } catch (error) {
        console.error('Submit Contact Message Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message. Please try again.' });
    }
};

const listContactMessages = async (req, res) => {
    try {
        const { data, unreadCount } = await fetchContactMessagesInbox();
        res.status(200).json({
            success: true,
            data,
            unreadCount
        });
    } catch (error) {
        console.error('List Contact Messages Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load messages.' });
    }
};

// Read/unread is now a separate inbox flag from the ticket lifecycle status.
const markContactMessageRead = async (req, res) => {
    try {
        const doc = await ContactMessage.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Message not found.' });

        doc.isRead = true;
        await saveContactMessage(doc, 'mark-read');

        res.status(200).json({ success: true, message: 'Marked as read.', data: doc.toAdminObject() });
    } catch (error) {
        console.error('Mark Contact Message Read Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update message.' });
    }
};

const markContactMessageUnread = async (req, res) => {
    try {
        const doc = await ContactMessage.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Message not found.' });

        doc.isRead = false;
        await saveContactMessage(doc, 'mark-unread');

        res.status(200).json({ success: true, message: 'Marked as unread.', data: doc.toAdminObject() });
    } catch (error) {
        console.error('Mark Contact Message Unread Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update message.' });
    }
};

const deleteContactMessage = async (req, res) => {
    try {
        const doc = await ContactMessage.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Message not found.' });

        await dualWrite(
            () => doc.deleteOne(),
            async () => {
                const repo = getContactMessageRepository();
                const pgRow = await repo.findByLegacyId(String(doc._id));
                if (pgRow) await repo.remove(pgRow.id);
            },
            {
                model: 'ContactMessage',
                operation: 'delete',
                mongoId: String(doc._id)
            }
        );

        res.status(200).json({ success: true, message: 'Message deleted.' });
    } catch (error) {
        console.error('Delete Contact Message Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete message.' });
    }
};

const replyContactMessage = async (req, res) => {
    try {
        const replyMessage = readString(req.body?.replyMessage, 10000);

        if (replyMessage.length < 5) {
            return res.status(400).json({
                success: false,
                message: 'Reply message must be at least 5 characters.'
            });
        }

        const doc = await ContactMessage.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Inquiry not found.' });
        }

        const settings = await getStoreSettings();
        const emailResult = await sendInquiryReplyEmail({
            to: doc.email,
            customerName: doc.name,
            subject: doc.subject,
            inquiryDate: doc.createdAt,
            originalMessage: doc.message,
            replyMessage,
            storeName: settings.storeName
        });

        if (!emailResult.delivered) {
            return res.status(502).json({
                success: false,
                message: emailResult.reason || 'Failed to send reply email. Please check SMTP settings.'
            });
        }

        const now = new Date();
        doc.replyMessage = replyMessage;
        doc.repliedAt = now;
        if (!doc.firstResponseAt) {
            doc.firstResponseAt = now;
        }
        doc.isRead = true;
        // A reply moves a brand-new ticket into progress; admins can later flip
        // it to resolved/closed via the dedicated status endpoint.
        if (doc.status === 'open') {
            doc.status = 'in_progress';
        }
        await saveContactMessage(doc, 'reply');

        await logSecurityEvent({
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            action: 'Inquiry Reply Sent',
            ipAddress: getClientIp(req),
            details: `Reply sent to ${doc.email}${doc.subject ? ` — ${doc.subject}` : ''}`
        });

        res.status(200).json({
            success: true,
            message: 'Reply sent successfully.',
            data: doc.toAdminObject()
        });
    } catch (error) {
        console.error('Reply Contact Message Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send reply. Please try again.' });
    }
};

// PATCH /api/admin/tickets/:id/assign — assign (or unassign) a ticket to an admin.
const assignTicket = async (req, res) => {
    try {
        const assignedTo = readString(req.body?.assignedTo, 80);

        const doc = await ContactMessage.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Ticket not found.' });

        doc.assignedTo = assignedTo;
        await saveContactMessage(doc, 'assign');

        await logSecurityEvent({
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            action: 'Ticket Assigned',
            ipAddress: getClientIp(req),
            details: `${doc.ticketNumber || doc._id} → ${assignedTo || 'Unassigned'}`
        });

        res.status(200).json({
            success: true,
            message: assignedTo ? `Ticket assigned to ${assignedTo}.` : 'Ticket unassigned.',
            data: doc.toAdminObject()
        });
    } catch (error) {
        console.error('Assign Ticket Error:', error);
        res.status(500).json({ success: false, message: 'Failed to assign ticket.' });
    }
};

// PATCH /api/admin/tickets/:id/status — move a ticket through its lifecycle.
const updateTicketStatus = async (req, res) => {
    try {
        const status = readString(req.body?.status, 20).toLowerCase();
        if (!TICKET_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Allowed: ${TICKET_STATUSES.join(', ')}.`
            });
        }

        const priority = req.body?.priority !== undefined
            ? readString(req.body.priority, 20).toLowerCase()
            : null;
        if (priority !== null && !TICKET_PRIORITIES.includes(priority)) {
            return res.status(400).json({
                success: false,
                message: `Invalid priority. Allowed: ${TICKET_PRIORITIES.join(', ')}.`
            });
        }

        const doc = await ContactMessage.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Ticket not found.' });

        doc.status = status;
        if (priority !== null) doc.priority = priority;

        // Stamp the resolution time on close, clear it when re-opened.
        if (CLOSED_TICKET_STATUSES.includes(status)) {
            if (!doc.resolvedAt) doc.resolvedAt = new Date();
        } else {
            doc.resolvedAt = null;
        }

        await saveContactMessage(doc, 'update-status');

        await logSecurityEvent({
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            action: 'Ticket Status Updated',
            ipAddress: getClientIp(req),
            details: `${doc.ticketNumber || doc._id} → ${status}${priority !== null ? ` (${priority})` : ''}`
        });

        res.status(200).json({
            success: true,
            message: `Ticket marked as ${status.replace('_', ' ')}.`,
            data: doc.toAdminObject()
        });
    } catch (error) {
        console.error('Update Ticket Status Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update ticket status.' });
    }
};

// GET /api/admin/tickets/stats — counts by status/priority for the inbox header.
const getTicketStats = async (req, res) => {
    try {
        const data = await fetchTicketStats();
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Get Ticket Stats Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load ticket stats.' });
    }
};

module.exports = {
    submitContactMessage,
    listContactMessages,
    markContactMessageRead,
    markContactMessageUnread,
    deleteContactMessage,
    replyContactMessage,
    assignTicket,
    updateTicketStatus,
    getTicketStats
};
