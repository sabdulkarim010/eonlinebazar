/********************************************************************
 * Project: EonlineBazar
 * File: financeRoutes.js
 * Location: routes/financeRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Secured API routes for the Finance & Analytics panel.
 * A dedicated password-protected login (POST /admin-login) issues a
 * short-lived finance session token; all data routes are strictly
 * guarded by the verifyFinanceToken middleware (401 if missing/invalid).
 ********************************************************************/

const express = require('express');
const router = express.Router();

const {
    getFinanceOverview,
    getFinanceChartData,
    financeAdminLogin,
    verifyFinanceToken
} = require('../controllers/financeController');

/********************************************************************
 # FINANCE ROUTES (ফাইন্যান্স ও অ্যানালিটিক্স এপিআই)
 ********************************************************************/

// ০. পাবলিক লগইন রুট — হার্ড-কোডেড পাসওয়ার্ড দিয়ে সেশন টোকেন ইস্যু করে
// URL: POST /api/finance/admin-login
router.post('/admin-login', financeAdminLogin);

// ১. KPI সামারি (প্রোটেক্টেড)
// URL: GET /api/finance/overview
router.get('/overview', verifyFinanceToken, getFinanceOverview);

// ২. চার্ট ডাটাসেট (প্রোটেক্টেড)
// URL: GET /api/finance/chart-data
router.get('/chart-data', verifyFinanceToken, getFinanceChartData);

module.exports = router;
