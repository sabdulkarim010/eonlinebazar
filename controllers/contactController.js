/********************************************************************
 * Project: EonlineBazar
 * File: contactController.js
 ********************************************************************/

const ContactMessage = require('../models/ContactMessage');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');

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
        const unreadCount = await ContactMessage.countDocuments({ isRead: false });
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
        const doc = await ContactMessage.findByIdAndUpdate(
            req.params.id,
            { isRead: true },
            { new: true }
        );
        if (!doc) return res.status(404).json({ success: false, message: 'Message not found.' });
        res.status(200).json({ success: true, message: 'Marked as read.', data: doc.toAdminObject() });
    } catch (error) {
        console.error('Mark Contact Message Read Error:', error);
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

module.exports = {
    submitContactMessage,
    listContactMessages,
    markContactMessageRead,
    deleteContactMessage
};
