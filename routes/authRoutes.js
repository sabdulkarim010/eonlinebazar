/********************************************************************
 * Project: EonlineBazar
 * File: authRoutes.js
 * Location: routes/authRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Token-protected endpoints for Active Devices & Session
 * management. Mounted at /api/auth in server.js.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyUser } = require('../middlewares/authMiddleware');

// ================== অ্যাক্টিভ সেশন / ডিভাইস ম্যানেজমেন্ট ==================
router.get('/sessions', verifyUser, authController.getSessions);
router.delete('/sessions/:id', verifyUser, authController.deleteSession);
router.post('/sessions/logout-others', verifyUser, authController.logoutOtherSessions);

module.exports = router;
