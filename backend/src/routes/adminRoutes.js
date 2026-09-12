/********************************************************************
 * Project: EonlineBazar
 * File: adminRoutes.js
 * Location: routes/adminRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Admin routes for handling customers data, admin login, 
 * and profile picture updates.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { getDashboardAnalytics } = require('../controllers/analyticsController');
const { getFinanceAnalytics } = require('../controllers/financeAnalyticsController');
const {
    approveOrderReturn,
    undoOrderRefund,
    rejectOrderReturn,
    processRefund,
    createManualOrder,
    updateOrderShippingAddress,
    masterUpdateOrder,
    bulkDeleteOrders,
    assignOrderToStaff
} = require('../controllers/orderAdminController');
const staffAuditController = require('../controllers/admin/staffAuditController');
const { adjustCustomerWallet } = require('../controllers/admin/walletAdminController');
const {
    getAllReviews,
    moderateReview,
    deleteReview
} = require('../controllers/reviewAdminController');
const {
    getPendingPaymentProofOrders,
    reviewPaymentProof
} = require('../controllers/orderPaymentProofController');
const {
    getPaymentReconciliation,
    markGatewayOrderPaid
} = require('../controllers/paymentReconciliationController');
const adminSecurityController = require('../controllers/adminSecurityController');
const twoFactorController = require('../controllers/twoFactorController');
const settingsController = require('../controllers/settingsController');
const masterSettingsController = require('../controllers/masterSettingsController');
const courierController = require('../controllers/courierController');
const adminCourierController = require('../controllers/admin/courierController');
const whatsappAlertsController = require('../controllers/whatsappAlertsController');
const paymentMethodController = require('../controllers/paymentMethodController');
const footerSettingsController = require('../controllers/footerSettingsController');
const pageContentController = require('../controllers/pageContentController');
const contactController = require('../controllers/contactController');
const newsletterAdminController = require('../controllers/newsletterAdminController');
const crmController = require('../controllers/admin/crmController');
const supplierController = require('../controllers/admin/supplierController');
const warehouseController = require('../controllers/admin/warehouseController');
const purchaseOrderController = require('../controllers/admin/purchaseOrderController');
const attendanceController = require('../controllers/admin/attendanceController');
const payrollController = require('../controllers/admin/payrollController');
const leaveController = require('../controllers/admin/leaveController');
const employeeController = require('../controllers/admin/employeeController');
const designationController = require('../controllers/admin/designationController');
const expenseController = require('../controllers/admin/expenseController');
const profitLossController = require('../controllers/admin/profitLossController');
const exportController = require('../controllers/admin/exportController');
const productController = require('../controllers/productController');
const enterpriseSummaryController = require('../controllers/admin/enterpriseSummaryController');
const upload = require('../middlewares/uploadMiddleware');
const { brandingUpload, paymentMethodLogoUpload, footerIconUpload, importFileUpload, employeePhotoUpload, employeeDocumentUpload } = upload;
const staffController = require('../controllers/staffController');
const staffRoutes = require('./staffRoutes');
const fileManagerRoutes = require('./fileManagerRoutes');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkPermission, requireSuperAdmin } = require('../middlewares/rbac');
const { checkBlacklist, adminLoginLimiter } = require('../middlewares/adminSecurity');
const { geoFence } = require('../middlewares/geoFencing');
const { checkAndAlertLowStock } = require('../services/stockAlertService');
const {
    downloadImportTemplate,
    bulkImportProductsHandler
} = require('../controllers/bulkImportController');
const cacheController = require('../controllers/cacheController');
const sandboxController = require('../controllers/sandboxController');

// Minimal staff roster for order assignment dropdowns (before /staff mount)
router.get('/staff/roster', verifyAdmin, checkPermission('manage_orders'), staffController.getStaffRoster);

// 🛡️ Super Admin staff management — own gate chain, see routes/staffRoutes.js
// URL: /api/admin/staff
router.use('/staff', staffRoutes);

// Staff activity audit — who changed what (SecurityLog grouped by admin actor)
router.get('/staff-audit', verifyAdmin, checkPermission('manage_security'), staffAuditController.getStaffActivity);
router.get('/staff-audit/:username', verifyAdmin, checkPermission('manage_security'), staffAuditController.getStaffActivityDetail);

// 🛡️ Super Admin file manager — browse / read / write / create / delete (project root only)
// URL: /api/admin/files
router.use('/files', fileManagerRoutes);

// 🛡️ RBAC discovery endpoints — readable by any signed-in admin. The panel uses
// them to render only the sections the current account is allowed to open.
router.get('/permissions', verifyAdmin, staffController.getPermissionCatalogue);
router.get('/me', verifyAdmin, staffController.getCurrentAdmin);

// Chat-admin / SPA compatibility — admin profile avatar (store Admin.image field)
router.get('/me/avatar', verifyAdmin, (req, res) => {
    try {
        const account = req.adminAccount;
        if (!account) {
            return res.status(401).json({
                success: false,
                message: 'Admin session could not be verified.',
            });
        }
        return res.json({
            success: true,
            avatar: account.image || null,
            name: account.displayName || account.name || account.username,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/me/avatar', verifyAdmin, async (req, res) => {
    try {
        const { avatar } = req.body || {};
        if (!avatar || !String(avatar).trim()) {
            return res.status(400).json({
                success: false,
                message: 'avatar URL is required',
            });
        }
        const Admin = require('../models/admin');
        const account = req.adminAccount;
        if (!account) {
            return res.status(401).json({
                success: false,
                message: 'Admin session could not be verified.',
            });
        }
        await Admin.findByIdAndUpdate(account._id, {
            image: String(avatar).trim(),
        });
        return res.json({
            success: true,
            message: 'Avatar updated',
            avatar: String(avatar).trim(),
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ১. কাস্টমারদের ডাটা পাওয়ার রাস্তা (GET)
router.get('/customers', verifyAdmin, checkPermission('manage_customers'), adminController.getAllCustomers);

// POS quick-add customer (must be before /customers/:id)
router.post('/customers/quick', verifyAdmin, checkPermission('manage_customers'), adminController.createQuickCustomer);

// Enterprise ERP + CRM + HRM summary widgets (GET)
router.get('/enterprise-summary', verifyAdmin, checkPermission('view_analytics'), enterpriseSummaryController.getEnterpriseSummary);

// ১গ. Sales & Order Analytics Dashboard (GET)
router.get('/dashboard-analytics', verifyAdmin, checkPermission('view_analytics'), getDashboardAnalytics);

// ১ঘ. Finance date-range analytics (GET)
// URL: GET /api/admin/analytics?period=&startDate=&endDate=
router.get('/analytics', verifyAdmin, checkPermission('view_analytics'), getFinanceAnalytics);

// Backward-compatible alias
router.get('/analytics/filter', verifyAdmin, checkPermission('view_analytics'), getFinanceAnalytics);

// Google Analytics 4 configuration status (Admin Settings dashboard link)
router.get('/analytics/status', verifyAdmin, (req, res) => {
    res.json({
        success: true,
        enabled: process.env.GOOGLE_ANALYTICS_ENABLED === 'true',
        measurementId: process.env.GOOGLE_ANALYTICS_ID || null,
        configured: !!process.env.GOOGLE_ANALYTICS_ID
    });
});

// ১ক. নির্দিষ্ট কাস্টমার, আপডেট, স্ট্যাটাস ও অর্ডার হিস্ট্রি
router.put('/users/:id/avatar', verifyAdmin, checkPermission('manage_customers'), upload.single('avatar'), adminController.updateCustomerAvatar);
router.delete('/users/:id/avatar', verifyAdmin, checkPermission('manage_customers'), adminController.deleteCustomerAvatar);
router.put('/customers/:id/avatar', verifyAdmin, checkPermission('manage_customers'), upload.single('avatar'), adminController.updateCustomerAvatar);
router.delete('/customers/:id/avatar', verifyAdmin, checkPermission('manage_customers'), adminController.deleteCustomerAvatar);
router.get('/customers/:id/orders', verifyAdmin, checkPermission('manage_customers'), adminController.getCustomerOrders);
router.get('/customers/:id', verifyAdmin, checkPermission('manage_customers'), adminController.getCustomerById);
router.put('/customers/:id', verifyAdmin, checkPermission('manage_customers'), adminController.updateCustomer);
router.patch('/customers/:id/status', verifyAdmin, checkPermission('manage_customers'), adminController.updateCustomerStatus);
router.delete('/customers/:id', verifyAdmin, checkPermission('manage_customers'), adminController.deleteCustomer);

// Manual wallet credit/debit for a customer
// URL: POST /api/admin/customers/:userId/wallet
router.post('/customers/:userId/wallet', verifyAdmin, checkPermission('manage_customers'), adjustCustomerWallet);

// Admin review moderation
// URL: GET /api/admin/reviews
router.get('/reviews', verifyAdmin, checkPermission('manage_orders'), getAllReviews);
router.patch('/reviews/:id/moderate', verifyAdmin, checkPermission('manage_orders'), moderateReview);
router.delete('/reviews/:id', verifyAdmin, checkPermission('manage_orders'), deleteReview);

// ১খ. অর্ডার রিটার্ন অনুমোদন ও ওয়ালেট রিফান্ড
// URL: PUT /api/admin/orders/:id/approve-return
router.put('/orders/:id/approve-return', verifyAdmin, checkPermission('manage_orders'), approveOrderReturn);

// URL: PUT /api/admin/orders/:id/reject-return
router.put('/orders/:id/reject-return', verifyAdmin, checkPermission('manage_orders'), rejectOrderReturn);

// URL: PATCH /api/admin/orders/:id/refund — flexible refund (wallet / bKash / Nagad / cash)
router.patch('/orders/:id/refund', verifyAdmin, checkPermission('manage_orders'), processRefund);

// URL: POST /api/admin/orders/:id/undo-refund
router.post('/orders/:id/undo-refund', verifyAdmin, checkPermission('manage_orders'), undoOrderRefund);

// URL: POST /api/admin/orders/manual — staff POS / phone order entry
router.post('/orders/manual', verifyAdmin, checkPermission('manage_orders'), createManualOrder);

// URL: GET /api/admin/orders/pending-payment-proof — manual payment proofs awaiting review
router.get('/orders/pending-payment-proof', verifyAdmin, checkPermission('manage_orders'), getPendingPaymentProofOrders);

// URL: PATCH /api/admin/orders/:orderId/review-payment-proof
router.patch('/orders/:orderId/review-payment-proof', verifyAdmin, checkPermission('manage_orders'), reviewPaymentProof);

// URL: POST /api/admin/orders/bulk-delete — delete up to 50 orders at once
router.post('/orders/bulk-delete', verifyAdmin, checkPermission('manage_orders'), bulkDeleteOrders);

// URL: GET /api/admin/payments/reconciliation — gateway/manual/COD payment overview
router.get('/payments/reconciliation', verifyAdmin, checkPermission('manage_orders'), getPaymentReconciliation);

// URL: PATCH /api/admin/payments/:orderId/mark-paid — manual gateway paid override
router.patch('/payments/:orderId/mark-paid', verifyAdmin, checkPermission('manage_orders'), markGatewayOrderPaid);

// URL: PUT /api/admin/orders/:id/address — admin edits shipping / contact details
router.put('/orders/:id/address', verifyAdmin, checkPermission('manage_orders'), updateOrderShippingAddress);

// URL: PUT /api/admin/orders/:id/master-update — shipping + items with live total recalc
router.put('/orders/:id/master-update', verifyAdmin, checkPermission('manage_orders'), masterUpdateOrder);

// URL: PATCH /api/admin/orders/:orderId/assign — assign order to a staff member
router.patch('/orders/:orderId/assign', verifyAdmin, checkPermission('manage_orders'), assignOrderToStaff);

// URL: GET /api/admin/whatsapp-alerts/pending — wa.me fallback queue for undelivered alerts
router.get('/whatsapp-alerts/pending', verifyAdmin, checkPermission('manage_orders'), whatsappAlertsController.getPendingWhatsAppAlertsHandler);
router.delete('/whatsapp-alerts/:id', verifyAdmin, checkPermission('manage_orders'), whatsappAlertsController.dismissWhatsAppAlertHandler);

// ১গ. 🚚 এক ক্লিকে কুরিয়ার পার্সেল বুকিং (Steadfast) + কনফিগ স্ট্যাটাস
// URL: POST /api/admin/orders/:id/send-courier
router.post('/orders/:id/send-courier', verifyAdmin, checkPermission('manage_orders'), courierController.sendOrderToCourier);
router.get('/courier/status', verifyAdmin, courierController.getCourierConfigStatus);

// 🚚 One-click Book & Sync (create consignment + SMS/WhatsApp + Shipped)
// URL: PATCH /api/admin/orders/:id/book-courier
router.patch('/orders/:orderId/book-courier', verifyAdmin, checkPermission('manage_orders'), adminCourierController.bookAndSyncCourier);

// 🚚 Manual courier status refresh
// URL: GET /api/admin/orders/:orderId/courier-status
router.get('/orders/:orderId/courier-status', verifyAdmin, checkPermission('manage_orders'), adminCourierController.getCourierStatus);

// Manual stock alert trigger (admin testing)
router.get('/stock/check-now', verifyAdmin, async (req, res) => {
    try {
        const payload = await checkAndAlertLowStock();
        res.json({ success: true, ...payload });
    } catch (err) {
        console.error('[StockAlert] Manual check failed:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

/********************************************************************
 # Bulk product import (CSV / Excel)
 # URL: /api/admin/products/import-template | /api/admin/products/bulk-import
 # Permission: manage_inventory (product catalog write access)
 ********************************************************************/
router.get(
    '/products/import-template',
    verifyAdmin,
    downloadImportTemplate
);
router.post(
    '/products/bulk-import',
    verifyAdmin,
    checkPermission('manage_inventory'),
    importFileUpload,
    bulkImportProductsHandler
);

/********************************************************************
 # Redis cache management (admin)
 # URL: /api/admin/cache/*
 ********************************************************************/
router.get('/cache/stats', verifyAdmin, cacheController.getCacheStats);
router.delete('/cache/flush', verifyAdmin, requireSuperAdmin, cacheController.flushCache);
router.delete('/cache/key/:pattern', verifyAdmin, cacheController.deleteCacheByPattern);

// ২. অ্যাডমিন লগইন করার রাস্তা (POST)
// পাইপলাইন: ব্ল্যাকলিস্ট গেট → জিও-ফেন্স (রিজিয়ন লক) → রেট-লিমিট → কন্ট্রোলার
router.post('/login', checkBlacklist, geoFence, adminLoginLimiter, adminSecurityController.loginAdmin);

// 🔐 অ্যাডমিন লগইন — Step 2 (OTP / TOTP → final JWT + AdminSession)
router.post('/verify-otp', checkBlacklist, adminLoginLimiter, adminSecurityController.verifyOtp);

// TEMPORARY emergency TOTP wipe — remove after production re-enrollment
router.post(
    '/reset-totp-temp',
    checkBlacklist,
    adminLoginLimiter,
    adminSecurityController.resetTotpEmergency
);
router.post(
    '/emergency-reset-totp',
    checkBlacklist,
    adminLoginLimiter,
    adminSecurityController.resetTotpEmergency
);

// 🔐 Multi-Option 2FA Manager (Email / Google Authenticator / SMS)
router.get('/2fa/status', verifyAdmin, twoFactorController.getTwoFactorStatus);
router.post('/2fa/totp/setup', verifyAdmin, twoFactorController.setupTotp);
router.post('/2fa/totp/verify', verifyAdmin, twoFactorController.verifyTotpSetup);
router.post('/2fa/totp/disable', verifyAdmin, twoFactorController.disableTotp);
router.post('/2fa/sms/send', verifyAdmin, twoFactorController.sendSmsSetupOtp);
router.post('/2fa/sms/verify', verifyAdmin, twoFactorController.verifySmsSetupOtp);
router.put('/2fa/method', verifyAdmin, twoFactorController.updateMethod);

// 🚪 Full admin sign-out (revokes current AdminSession + clears cookies)
router.post('/logout', verifyAdmin, adminSecurityController.logoutCurrent);

// 🖥️ Active Devices & Sessions (remote logout)
router.get('/sessions', verifyAdmin, adminSecurityController.getAdminSessions);
router.post('/sessions/logout-others', verifyAdmin, adminSecurityController.logoutOtherSessions);
router.post('/sessions/logout/:id', verifyAdmin, adminSecurityController.logoutSession);

// 🛡️ IP Blacklist Manager + Login History (permission: manage_security)
router.get('/blacklist', verifyAdmin, checkPermission('manage_security'), adminSecurityController.getBlacklist);
router.post('/blacklist', verifyAdmin, checkPermission('manage_security'), adminSecurityController.addBlacklist);
router.delete('/blacklist/:id', verifyAdmin, checkPermission('manage_security'), adminSecurityController.removeBlacklist);
router.get('/login-history', verifyAdmin, checkPermission('manage_security'), adminSecurityController.getLoginHistory);

// ✨ AI product content assist (Anthropic proxy)
router.post('/ai/product-assist', verifyAdmin, adminController.aiProductAssist);

// ৩. টোকেন ভেরিফিকেশন (GET)
router.get('/verify-token', verifyAdmin, adminController.verifyAdminToken);

// ৩ক. Global Sync Data (coupon auto-expiry + fresh coupon list)
router.post('/sync-data', verifyAdmin, adminController.syncAdminData);

// ৪. সিকিউরিটি লগস (GET)
router.get('/logs', verifyAdmin, checkPermission('manage_security'), adminController.getSecurityLogs);

// ৫. সিস্টেম ডেলিভারি সেটিংস (GET / PUT / POST)
// পড়া সবার জন্য খোলা (অর্ডার/চেকআউট ভিউ এই ভ্যালুগুলো দেখায়), লেখা কেবল manage_settings-এ
router.get('/all-settings', verifyAdmin, settingsController.getAllSettings);
router.get('/settings', verifyAdmin, settingsController.getSettings);
router.put('/settings', verifyAdmin, checkPermission('manage_settings'), settingsController.updateSettings);
router.post('/settings', verifyAdmin, checkPermission('manage_settings'), settingsController.updateSettings);
router.get('/rate-limit-settings', verifyAdmin, checkPermission('manage_settings'), settingsController.getRateLimitSettings);
router.put('/rate-limit-settings', verifyAdmin, checkPermission('manage_settings'), settingsController.updateRateLimitSettings);
router.post('/rate-limit-settings', verifyAdmin, checkPermission('manage_settings'), settingsController.updateRateLimitSettings);
router.post('/settings/cache', verifyAdmin, checkPermission('manage_settings'), settingsController.updateCacheSettings);

// ৫খ. মাস্টার সেটিংস — অ্যানাউন্সমেন্ট, ফ্রি শিপিং, ক্যাশব্যাক, পয়েন্ট, রিফান্ড (Singleton)
// একটি সেভ অ্যাকশনেই সব সেটিংস আপডেট হয়।
// URL: GET|POST|PUT /api/admin/master-settings
router.get('/master-settings', verifyAdmin, masterSettingsController.getMasterSettings);
router.put('/master-settings', verifyAdmin, checkPermission('manage_settings'), masterSettingsController.updateMasterSettings);
router.post('/master-settings', verifyAdmin, checkPermission('manage_settings'), masterSettingsController.updateMasterSettings);

// URL: POST|PUT /api/admin/master-settings/update — unified "Save Master Settings"
router.post('/master-settings/update', verifyAdmin, checkPermission('manage_settings'), masterSettingsController.updateMasterSettings);
router.put('/master-settings/update', verifyAdmin, checkPermission('manage_settings'), masterSettingsController.updateMasterSettings);

/********************************************************************
 # ৫গ. 💳 DYNAMIC PAYMENT METHOD CATALOG (CRUD)
 # URL: /api/admin/payment-methods
 # প্রতিটি রুট manage_settings পারমিশনে সুরক্ষিত। লোগো আপলোড multipart
 # (field: logo) — গেটওয়ে ক্রেডেনশিয়াল সেভের আগেই এনক্রিপ্ট হয়ে যায়।
 # দ্রষ্টব্য: /reorder অবশ্যই /:id এর আগে — নাহলে "reorder" একটি আইডি হিসেবে ধরা পড়ে।
 ********************************************************************/
router.get('/payment-methods', verifyAdmin, checkPermission('manage_settings'), paymentMethodController.listPaymentMethods);
router.patch('/payment-methods/reorder', verifyAdmin, checkPermission('manage_settings'), paymentMethodController.reorderPaymentMethods);
router.post(
    '/payment-methods',
    verifyAdmin,
    checkPermission('manage_settings'),
    paymentMethodLogoUpload,
    paymentMethodController.createPaymentMethod
);
router.get('/payment-methods/:id', verifyAdmin, checkPermission('manage_settings'), paymentMethodController.getPaymentMethod);
router.put(
    '/payment-methods/:id',
    verifyAdmin,
    checkPermission('manage_settings'),
    paymentMethodLogoUpload,
    paymentMethodController.updatePaymentMethod
);
router.patch('/payment-methods/:id/toggle', verifyAdmin, checkPermission('manage_settings'), paymentMethodController.togglePaymentMethod);
router.delete('/payment-methods/:id', verifyAdmin, checkPermission('manage_settings'), paymentMethodController.deletePaymentMethod);

/********************************************************************
 # ৫ঘ. 🦶 DYNAMIC FOOTER SETTINGS
 # URL: /api/admin/footer-settings
 ********************************************************************/
router.get('/footer-settings', verifyAdmin, checkPermission('manage_settings'), footerSettingsController.getAdminFooterSettings);
router.put('/footer-settings', verifyAdmin, checkPermission('manage_settings'), footerSettingsController.updateFooterSettings);
router.post('/footer-settings', verifyAdmin, checkPermission('manage_settings'), footerSettingsController.updateFooterSettings);
router.post(
    '/footer-settings/upload-icon',
    verifyAdmin,
    checkPermission('manage_settings'),
    footerIconUpload,
    footerSettingsController.uploadFooterIcon
);

/********************************************************************
 # ৫ঘ.১ 💳 FOOTER PAYMENT BADGES CRUD
 # URL: /api/admin/footer/payment-badges
 ********************************************************************/
router.get('/footer/payment-badges', verifyAdmin, checkPermission('manage_settings'), footerSettingsController.getPaymentBadges);
router.post('/footer/payment-badges', verifyAdmin, checkPermission('manage_settings'), footerSettingsController.addPaymentBadge);
router.delete('/footer/payment-badges/:index', verifyAdmin, checkPermission('manage_settings'), footerSettingsController.deletePaymentBadge);

/********************************************************************
 # ৫ঙ. 📄 PAGE CONTENT MANAGER (CMS)
 # URL: /api/admin/pages
 ********************************************************************/
router.get('/pages', verifyAdmin, checkPermission('manage_settings'), pageContentController.listAdminPages);
router.post('/pages', verifyAdmin, checkPermission('manage_settings'), pageContentController.createPage);
router.get('/pages/:slug', verifyAdmin, checkPermission('manage_settings'), pageContentController.getAdminPage);
router.put('/pages/:slug', verifyAdmin, checkPermission('manage_settings'), pageContentController.updatePageContent);
router.post('/pages/:slug/footer-link', verifyAdmin, checkPermission('manage_settings'), pageContentController.addPageToFooter);
router.post('/pages/:slug', verifyAdmin, checkPermission('manage_settings'), pageContentController.updatePageContent);

/********************************************************************
 # ৫চ. ✉️ CUSTOMER MESSAGES INBOX
 # URL: /api/admin/messages
 ********************************************************************/
router.get('/messages', verifyAdmin, checkPermission('manage_settings'), contactController.listContactMessages);
router.patch('/messages/:id/read', verifyAdmin, checkPermission('manage_settings'), contactController.markContactMessageRead);
router.patch('/messages/:id/unread', verifyAdmin, checkPermission('manage_settings'), contactController.markContactMessageUnread);
router.delete('/messages/:id', verifyAdmin, checkPermission('manage_settings'), contactController.deleteContactMessage);

/********************************************************************
 # ৫চ.২ 🎫 SUPPORT TICKET LIFECYCLE (ContactMessage tickets)
 # URL: /api/admin/tickets/*
 ********************************************************************/
router.get('/tickets/stats', verifyAdmin, checkPermission('manage_settings'), contactController.getTicketStats);
router.patch('/tickets/:id/assign', verifyAdmin, checkPermission('manage_settings'), contactController.assignTicket);
router.patch('/tickets/:id/status', verifyAdmin, checkPermission('manage_settings'), contactController.updateTicketStatus);

/********************************************************************
 # ৫চ.১ 🤝 CRM AUTOMATION DASHBOARDS
 # URL: /api/admin/crm/*
 ********************************************************************/
router.get('/crm/abandoned-carts', verifyAdmin, checkPermission('manage_marketing'), crmController.getAbandonedCartStats);
router.post('/crm/abandoned-carts/:userId/notify', verifyAdmin, checkPermission('manage_marketing'), crmController.notifyAbandonedCart);

/********************************************************************
 # ERP Finance — Expense Ledger (for advanced P&L)
 # URL: /api/admin/expenses
 # Permission: manage_settings (finance/settings owner)
 # Named /summary is declared before /:id so it is never read as an id.
 ********************************************************************/
router.get('/expenses/summary', verifyAdmin, checkPermission('manage_settings'), expenseController.getExpenseSummary);
router.post('/expenses/upload-receipt', verifyAdmin, checkPermission('manage_settings'), expenseController.receiptUploadMiddleware, expenseController.uploadExpenseReceipt);
router.get('/expenses', verifyAdmin, checkPermission('manage_settings'), expenseController.getAllExpenses);
router.post('/expenses', verifyAdmin, checkPermission('manage_settings'), expenseController.createExpense);
router.patch('/expenses/:id', verifyAdmin, checkPermission('manage_settings'), expenseController.updateExpense);
router.delete('/expenses/:id', verifyAdmin, checkPermission('manage_settings'), expenseController.deleteExpense);

/********************************************************************
 # ERP Finance — Advanced Profit & Loss (superadmin only)
 # URL: /api/admin/finance/profit-loss[/export-pdf|/export-csv]
 ********************************************************************/
router.get('/finance/profit-loss', verifyAdmin, requireSuperAdmin, profitLossController.getProfitLossReport);
router.get('/finance/profit-loss/export-pdf', verifyAdmin, requireSuperAdmin, exportController.exportPLtoPDF);
router.get('/finance/profit-loss/export-csv', verifyAdmin, requireSuperAdmin, exportController.exportPLtoCSV);
router.get('/orders/export-csv', verifyAdmin, checkPermission('manage_orders'), exportController.exportOrdersCSV);

/********************************************************************
 # ERP — Suppliers, Warehouses, Purchase Orders
 # URL: /api/admin/suppliers | /warehouses | /purchase-orders
 ********************************************************************/
router.get('/suppliers', verifyAdmin, checkPermission('manage_inventory'), supplierController.getAllSuppliers);
router.get('/suppliers/:id', verifyAdmin, checkPermission('manage_inventory'), supplierController.getSupplierById);
router.post('/suppliers', verifyAdmin, checkPermission('manage_inventory'), supplierController.createSupplier);
router.put('/suppliers/:id', verifyAdmin, checkPermission('manage_inventory'), supplierController.updateSupplier);
router.delete('/suppliers/:id', verifyAdmin, checkPermission('manage_inventory'), supplierController.deleteSupplier);

router.get('/warehouses', verifyAdmin, checkPermission('manage_inventory'), warehouseController.getAllWarehouses);
router.get('/warehouses/:id', verifyAdmin, checkPermission('manage_inventory'), warehouseController.getWarehouseById);
router.post('/warehouses', verifyAdmin, checkPermission('manage_inventory'), warehouseController.createWarehouse);
router.put('/warehouses/:id', verifyAdmin, checkPermission('manage_inventory'), warehouseController.updateWarehouse);
router.delete('/warehouses/:id', verifyAdmin, checkPermission('manage_inventory'), warehouseController.deleteWarehouse);

// Product detail with supplier/warehouse populated — admin-only because the
// public product endpoint must not expose vendor names or phone numbers.
router.get('/products/:id', verifyAdmin, checkPermission('manage_inventory'), productController.getAdminProductById);

router.get('/purchase-orders', verifyAdmin, checkPermission('manage_inventory'), purchaseOrderController.getAllPOs);
router.post('/purchase-orders', verifyAdmin, checkPermission('manage_inventory'), purchaseOrderController.createPO);
// Action routes are declared before /:id so "receive"/"cancel" are not read as ids.
router.post('/purchase-orders/:id/receive', verifyAdmin, checkPermission('manage_inventory'), purchaseOrderController.receivePO);
router.post('/purchase-orders/:id/cancel', verifyAdmin, checkPermission('manage_inventory'), purchaseOrderController.cancelPO);
router.get('/purchase-orders/:id', verifyAdmin, checkPermission('manage_inventory'), purchaseOrderController.getPOById);
router.put('/purchase-orders/:id', verifyAdmin, checkPermission('manage_inventory'), purchaseOrderController.updatePO);

/********************************************************************
 # 👥 HRM — Attendance & Shifts, Payroll, Leave
 # URL: /api/admin/hrm/*
 ********************************************************************/
// Staff roster for the HRM dropdowns. The order-assignment roster at
// /staff/roster needs manage_orders, and /staff needs superadmin — an HRM
// manager holds neither, so the same controller is exposed under manage_staff.
router.get('/hrm/staff', verifyAdmin, checkPermission('manage_staff'), staffController.getStaffRoster);

// — Designations (job titles for operational employees) —
router.get('/hrm/designations', verifyAdmin, checkPermission('manage_staff'), designationController.getAllDesignations);
router.post('/hrm/designations', verifyAdmin, checkPermission('manage_staff'), designationController.createDesignation);
router.patch('/hrm/designations/:id', verifyAdmin, checkPermission('manage_staff'), designationController.updateDesignation);
router.delete('/hrm/designations/:id', verifyAdmin, checkPermission('manage_staff'), designationController.deleteDesignation);

// — Operational employees (non-login staff) —
// Named + nested sub-paths (stats, profile, photo, documents) are declared
// before the bare /:id routes so they are never read as a record id.
router.get('/hrm/employees/stats', verifyAdmin, checkPermission('manage_staff'), employeeController.getEmployeeStats);
router.get('/hrm/employees', verifyAdmin, checkPermission('manage_staff'), employeeController.getAllEmployees);
router.get('/hrm/employees/:id/profile', verifyAdmin, checkPermission('manage_staff'), employeeController.getEmployeeProfile);
router.get('/hrm/employees/:id/access-status', verifyAdmin, checkPermission('manage_staff'), employeeController.getAccessStatus);
router.post('/hrm/employees/:id/grant-access', verifyAdmin, checkPermission('manage_staff'), employeeController.grantSystemAccess);
router.post('/hrm/employees/:id/revoke-access', verifyAdmin, checkPermission('manage_staff'), employeeController.revokeSystemAccess);
router.post('/hrm/employees/:id/reactivate-access', verifyAdmin, checkPermission('manage_staff'), employeeController.reactivateSystemAccess);
router.post('/hrm/employees/:id/unlink-access', verifyAdmin, checkPermission('manage_staff'), employeeController.unlinkSystemAccess);
router.get('/hrm/employees/:id', verifyAdmin, checkPermission('manage_staff'), employeeController.getEmployeeById);
router.post('/hrm/employees', verifyAdmin, checkPermission('manage_staff'), employeeController.createEmployee);
router.post('/hrm/employees/:id/photo', verifyAdmin, checkPermission('manage_staff'), employeePhotoUpload, employeeController.uploadEmployeePhoto);
router.post('/hrm/employees/:id/documents', verifyAdmin, checkPermission('manage_staff'), employeeDocumentUpload, employeeController.uploadEmployeeDocument);
router.delete('/hrm/employees/:id/documents/:docId', verifyAdmin, checkPermission('manage_staff'), employeeController.deleteEmployeeDocument);
router.patch('/hrm/employees/:id', verifyAdmin, checkPermission('manage_staff'), employeeController.updateEmployee);
router.delete('/hrm/employees/:id', verifyAdmin, checkPermission('manage_staff'), employeeController.deleteEmployee);

// — Attendance —
// Named sub-paths are declared before any /:id route so "summary" and
// "late-report" are never read as record ids.
router.get('/hrm/attendance', verifyAdmin, checkPermission('manage_staff'), attendanceController.getAttendanceList);
router.get('/hrm/attendance/summary', verifyAdmin, checkPermission('manage_staff'), attendanceController.getAttendanceSummary);
router.get('/hrm/attendance/late-report', verifyAdmin, checkPermission('manage_staff'), attendanceController.getLateReport);
router.post('/hrm/attendance/mark', verifyAdmin, checkPermission('manage_staff'), attendanceController.markAttendance);
router.post('/hrm/attendance/clock-in', verifyAdmin, checkPermission('manage_staff'), attendanceController.clockIn);
router.post('/hrm/attendance/clock-out', verifyAdmin, checkPermission('manage_staff'), attendanceController.clockOut);

// — Shifts —
router.get('/hrm/shifts', verifyAdmin, checkPermission('manage_staff'), attendanceController.getShifts);
router.post('/hrm/shifts', verifyAdmin, checkPermission('manage_staff'), attendanceController.createShift);
router.patch('/hrm/shifts/:id', verifyAdmin, checkPermission('manage_staff'), attendanceController.updateShift);
router.delete('/hrm/shifts/:id', verifyAdmin, checkPermission('manage_staff'), attendanceController.deleteShift);

// — Payroll —
router.get('/hrm/payroll', verifyAdmin, checkPermission('manage_staff'), payrollController.getAllPayrolls);
router.post('/hrm/payroll/generate', verifyAdmin, checkPermission('manage_staff'), payrollController.generatePayroll);
router.post('/hrm/payroll/salary-config', verifyAdmin, checkPermission('manage_staff'), payrollController.updateSalaryConfig);
router.get('/hrm/payroll/:id/payslip', verifyAdmin, checkPermission('manage_staff'), payrollController.generatePaySlip);
router.patch('/hrm/payroll/:id/approve', verifyAdmin, checkPermission('manage_staff'), payrollController.approvePayroll);
router.patch('/hrm/payroll/:id/paid', verifyAdmin, checkPermission('manage_staff'), payrollController.markPaid);

// — Leave —
router.get('/hrm/leaves', verifyAdmin, checkPermission('manage_staff'), leaveController.getAllLeaves);
router.get('/hrm/leaves/balance', verifyAdmin, checkPermission('manage_staff'), leaveController.getLeaveBalance);
router.get('/hrm/leaves/calendar', verifyAdmin, checkPermission('manage_staff'), leaveController.getLeaveCalendar);
router.post('/hrm/leaves/apply', verifyAdmin, checkPermission('manage_staff'), leaveController.applyLeave);
router.patch('/hrm/leaves/:id/approve', verifyAdmin, checkPermission('manage_staff'), leaveController.approveLeave);
router.patch('/hrm/leaves/:id/reject', verifyAdmin, checkPermission('manage_staff'), leaveController.rejectLeave);

/********************************************************************
 # ৫ছ. 📧 NEWSLETTER & EMAIL CAMPAIGNS
 # URL: /api/admin/newsletter/*
 ********************************************************************/
router.get('/newsletter/subscribers', verifyAdmin, newsletterAdminController.listSubscribers);
router.delete('/newsletter/subscribers/:id', verifyAdmin, newsletterAdminController.deleteSubscriber);
router.post('/newsletter/campaigns', verifyAdmin, checkPermission('manage_marketing'), newsletterAdminController.createCampaign);
router.get('/newsletter/campaigns', verifyAdmin, checkPermission('manage_marketing'), newsletterAdminController.listCampaigns);
router.post('/newsletter/campaigns/:id/send', verifyAdmin, checkPermission('manage_marketing'), newsletterAdminController.sendCampaign);
router.post('/newsletter/campaigns/:id/test', verifyAdmin, checkPermission('manage_marketing'), newsletterAdminController.testCampaign);

// URL: GET|POST /api/admin/announcement-settings (legacy announcement-only save)
router.get('/announcement-settings', verifyAdmin, masterSettingsController.getAnnouncementSettings);
router.post('/announcement-settings', verifyAdmin, checkPermission('manage_settings'), masterSettingsController.updateAnnouncementSettings);

// URL: GET|POST /api/admin/settings/announcement (legacy alias)
router.get('/settings/announcement', verifyAdmin, masterSettingsController.getAnnouncementSettings);
router.post('/settings/announcement', verifyAdmin, checkPermission('manage_settings'), masterSettingsController.updateAnnouncementSettings);

// ৫ক. অ্যাডমিন প্ল্যাটফর্ম সেটিংস (GET নিজের প্রোফাইল / PUT স্টোর প্রেফারেন্স)
router.get('/platform-settings', verifyAdmin, adminController.getAdminSettings);
router.put('/platform-settings', verifyAdmin, checkPermission('manage_settings'), adminController.updateAdminSettings);

// ৬. স্টোর লোগো / ফ্যাভিকন আপলোড (POST — multipart logo + favicon)
router.post(
    '/upload-branding',
    verifyAdmin,
    checkPermission('manage_settings'),
    brandingUpload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'favicon', maxCount: 1 }
    ]),
    adminController.uploadStoreBranding
);

// ৭. প্রোফাইল পিকচার আপলোড করার রাস্তা (POST)
router.post('/update-profile-pic', verifyAdmin, upload.single('profilePic'), adminController.updateProfilePic);

// ৮. অ্যাডমিন প্রোফাইল (GET ছবি / PUT প্রোফাইল ডিটেইলস)
router.get('/profile', verifyAdmin, adminController.getAdminProfile);
router.put('/profile', verifyAdmin, adminController.updateAdminProfile);

// 🧪 Sandbox mode — super-admin only (Stripe-style test/live data separation)
router.get('/sandbox/status', verifyAdmin, requireSuperAdmin, sandboxController.getSandboxStatus);
router.post('/sandbox/toggle', verifyAdmin, requireSuperAdmin, sandboxController.toggleSandboxMode);
router.post('/sandbox/reset-test-data', verifyAdmin, requireSuperAdmin, sandboxController.resetTestData);
router.post('/sandbox/reset-real-data', verifyAdmin, requireSuperAdmin, sandboxController.resetRealData);

module.exports = router;
