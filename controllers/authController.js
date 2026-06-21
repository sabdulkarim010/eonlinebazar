/********************************************************************
 * Project: EonlineBazar
 * File: authController.js
 * Location: controllers/authController.js
 * Author: Abdul Karim Sheikh
 * Description: Active Devices & Sessions management for logged-in
 * users. Backed by the dedicated UserSession collection. Deleting a
 * session here instantly invalidates that device's JWT on its next
 * request (enforced inside authMiddleware.verifyUser).
 ********************************************************************/

const mongoose = require('mongoose');
const UserSession = require('../models/userSession');

/* =======================================================
   ১. বর্তমান ইউজারের সব অ্যাক্টিভ সেশন দেখা
   বর্তমান রিকোয়েস্টের সেশনটি req.user.sid দিয়ে চিহ্নিত করা হয়
   GET /api/auth/sessions
   ======================================================= */
exports.getSessions = async (req, res) => {
    try {
        const currentSid = req.user.sid;

        const sessions = await UserSession
            .find({ userId: req.user.id })
            .sort({ lastActiveAt: -1 })
            .lean();

        const data = sessions.map(s => ({
            id: s._id,
            sessionId: s.sessionId,
            device: s.device,
            browser: s.browser,
            ip: s.ipAddress,
            location: s.location || 'Unknown Location',
            userAgent: s.userAgent,
            createdAt: s.createdAt,
            lastActiveAt: s.lastActiveAt,
            isCurrent: currentSid ? s.sessionId === currentSid : false
        }));

        res.status(200).json({ success: true, sessions: data });
    } catch (error) {
        console.error("Get Sessions Error:", error);
        res.status(500).json({ success: false, message: "Failed to load active sessions." });
    }
};

/* =======================================================
   ২. নির্দিষ্ট একটি সেশন রিমোট লগআউট করা
   :id হিসেবে ডাটাবেজ _id অথবা sessionId — দুটোই গ্রহণযোগ্য
   DELETE /api/auth/sessions/:id
   ======================================================= */
exports.deleteSession = async (req, res) => {
    try {
        const { id } = req.params;

        // ইউজার শুধু নিজের সেশনই মুছতে পারবে (ownership guard)
        const orMatch = [{ sessionId: id }];
        if (mongoose.Types.ObjectId.isValid(id)) {
            orMatch.push({ _id: id });
        }

        const target = await UserSession.findOne({ userId: req.user.id, $or: orMatch });
        if (!target) {
            return res.status(404).json({ success: false, message: "Session not found or already logged out." });
        }

        const isCurrent = req.user.sid && target.sessionId === req.user.sid;
        await target.deleteOne();

        res.status(200).json({
            success: true,
            message: isCurrent ? "This device has been logged out." : "Device logged out remotely.",
            loggedOutCurrent: !!isCurrent
        });
    } catch (error) {
        console.error("Delete Session Error:", error);
        res.status(500).json({ success: false, message: "Failed to log out the device." });
    }
};

/* =======================================================
   ৩. বর্তমান ডিভাইস বাদে অন্য সব ডিভাইস লগআউট করা
   POST /api/auth/sessions/logout-others
   ======================================================= */
exports.logoutOtherSessions = async (req, res) => {
    try {
        const currentSid = req.user.sid;
        if (!currentSid) {
            return res.status(400).json({ success: false, message: "Current session could not be identified." });
        }

        const result = await UserSession.deleteMany({
            userId: req.user.id,
            sessionId: { $ne: currentSid }
        });

        res.status(200).json({
            success: true,
            message: result.deletedCount > 0
                ? `Logged out ${result.deletedCount} other device(s) successfully.`
                : "No other active devices found.",
            removed: result.deletedCount
        });
    } catch (error) {
        console.error("Logout Other Sessions Error:", error);
        res.status(500).json({ success: false, message: "Failed to log out other devices." });
    }
};
