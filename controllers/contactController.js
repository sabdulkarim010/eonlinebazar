/********************************************************************
 * Project: EonlineBazar
 * File: contactController.js
 ********************************************************************/

const ContactMessage = require('../models/ContactMessage');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { sendInquiryReplyEmail } = require('../utils/mailer');
const { getStoreSettings } = require('../utils/storeSettingsService');

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

        const doc = await ContactMessage.create({ name, email, phone, subject, message });

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
        const messages = await ContactMessage.find().sort({ createdAt: -1 }).limit(500);
        const unreadCount = await ContactMessage.countDocuments({
            $or: [
                { status: 'unread' },
                { status: { $exists: false }, isRead: false }
            ]
        });
        res.status(200).json({
            success: true,
            data: messages.map((m) => m.toAdminObject()),
            unreadCount
        });
    } catch (error) {
        console.error('List Contact Messages Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load messages.' });
    }
};

const markContactMessageRead = async (req, res) => {
    try {
        const doc = await ContactMessage.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Message not found.' });

        if (doc.status === 'replied') {
            return res.status(200).json({
                success: true,
                message: 'Replied inquiries remain marked as replied.',
                data: doc.toAdminObject()
            });
        }

        doc.isRead = true;
        doc.status = 'read';
        await doc.save();

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

        if (doc.status === 'replied') {
            return res.status(400).json({
                success: false,
                message: 'Replied inquiries cannot be marked as unread.'
            });
        }

        doc.isRead = false;
        doc.status = 'unread';
        await doc.save();

        res.status(200).json({ success: true, message: 'Marked as unread.', data: doc.toAdminObject() });
    } catch (error) {
        console.error('Mark Contact Message Unread Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update message.' });
    }
};

const deleteContactMessage = async (req, res) => {
    try {
        const doc = await ContactMessage.findByIdAndDelete(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Message not found.' });
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

        doc.status = 'replied';
        doc.replyMessage = replyMessage;
        doc.repliedAt = new Date();
        doc.isRead = true;
        await doc.save();

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

module.exports = {
    submitContactMessage,
    listContactMessages,
    markContactMessageRead,
    markContactMessageUnread,
    deleteContactMessage,
    replyContactMessage
};
