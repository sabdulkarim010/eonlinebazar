/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-state.js
 * Description: Shared admin window state, tokens, and page metadata.
 */
window.token = localStorage.getItem('adminToken');
window.adminPollErrorCounts = {};
window.MAX_ADMIN_POLL_ERRORS = 3;
window.tableBody = document.getElementById('adminOrderTableBody') || document.getElementById('orderTableBody');
window.prodTableBody = document.getElementById('adminProductTableBody');
window.PRODUCT_PAGINATION_STORAGE_KEY = 'eob_admin_products_pagination';
window.itemsPerPage = 10;      // প্রতি পেজে ডিফল্ট প্রোডাক্ট সংখ্যা
window.expandedOrderIds = new Set();
window.ADMIN_TOAST_ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
};
window.adminRealtimeToasts = [];
window.adminNotifHistory = [];
window.ADMIN_PAGE_META = {
    'view-overview':        { title: 'Dashboard Overview',      subtitle: 'Real-time monitoring engine for EonlineBazar platform.' },
    'view-customers':       { title: 'All Customers',           subtitle: 'Manage registered users, account status, and order history.' },
    'view-orders':          { title: 'Live Orders',             subtitle: 'Real-time monitoring engine for order processing.' },
    'view-add-product':     { title: 'Add New Product',         subtitle: 'Launch a new product with pricing, media, and inventory details.' },
    'view-manage-products': { title: 'Manage Products',         subtitle: 'Search, filter, export, and maintain your product catalog.' },
    'manage-category':      { title: 'Manage Categories',       subtitle: 'Organize products with dynamic category labels.' },
    'manage-brands':        { title: 'Manage Brands',           subtitle: 'Maintain brand names for catalog filtering and display.' },
    'manage-navbar-links':  { title: 'Navbar Menu Links',       subtitle: 'Manage top-bar promo links — categories stay in the ☰ All drawer.' },
    'manage-attributes':    { title: 'Product Attributes',      subtitle: 'Define attribute names and values (Size, Color, etc.).' },
    'manage-coupons':       { title: 'Manage Coupons',          subtitle: 'Create discount codes, set usage limits, and track redemptions.' },
    'view-security':        { title: 'Security Logs',           subtitle: 'Monitor authentication events and system security activity.' },
    'view-sessions':        { title: 'Active Devices & Sessions', subtitle: 'Review and remotely revoke logged-in admin devices.' },
    'view-audit':           { title: 'Security & Audit',         subtitle: 'Login history, intrusion attempts, and IP blacklist firewall.' },
    'view-master-settings': { title: 'System Settings',          subtitle: 'Configure shipping, notifications, loyalty rewards, and store integrations.' },
    'view-banners':          { title: 'Hero Banners',             subtitle: 'Upload and manage homepage banner slides, autoplay, and display settings.' },
    'view-messages':        { title: 'Messages / Inquiries',     subtitle: 'Customer contact form submissions from the storefront.' },
    'view-newsletter-subscribers': { title: 'Newsletter Subscribers', subtitle: 'Manage newsletter subscribers and filter by tags.' },
    'view-newsletter-campaigns':   { title: 'Email Campaigns',        subtitle: 'Create, test, and send newsletter email campaigns.' },
    'view-staff':           { title: 'Staff Management',         subtitle: 'Create staff accounts, assign permissions, and control access instantly.' },
    'view-file-manager':    { title: 'File Manager',             subtitle: 'Browse, search, and edit project files securely from the admin panel.' },
    'view-settings':        { title: 'Admin Settings',          subtitle: 'Manage your profile, store preferences, shipping rules, and branding.' }
};
window.allOrders = {};
window.allProducts = {};
window.globalProducts = [];
window.currentFilteredProducts = [];
window.allCustomers = [];
window.globalOrders = [];
window.currentInvoiceOrderId = null;
window.currentFilteredOrders = [];
window.growthChartInstance = null;
window.salesTrendChartInstance = null;
window.topProductsChartInstance = null;
window.dashboardAnalytics = null;
window.salesTrendPeriod = 'daily';
window.topProductsChartType = 'bar';
window.currentPage = 1;          // প্রোডাক্ট পেজের বর্তমান পেজ নম্বর
window.savedProductPageBeforeAction = null;
window.currentOrderPage = 1;     // অর্ডারের বর্তমান পেজ নম্বর
window.ordersPerPage = 10;       // প্রতি পেজে ডিফল্ট অর্ডারের সংখ্যা
window.currentOrderStatusFilter = 'all';
window.currentOrderSandboxFilter = 'all';
window.currentOrderDateFilter = '';
window.orderSearchDebounceTimer = null;
window.isStockAscending = true;
window.adminPlatformTimezone = 'Asia/Dhaka';
window.adminCurrencySymbol = '৳';
window.adminRewardSettings = { refundUndoWindowHours: 72 };
window.adminSocket = null;
window.adminSocketInitialized = false;
window.adminNotifUnread = 0;
window.sidebarOrdersCount = 0;
window.sidebarMessagesCount = 0;
window._catalogQuickEditSaveHandler = null;
window.customerSegmentFilter = 'all';
window.customerSegmentThresholds = null;
window.selectedCustomerIds = new Set();
window.customerPg = null;
window.productPg = null;
window.securityPg = null;
window.auditPg = null;
window.messagePg = null;
window.orderPg = null;
window.customerSearchQuery = '';
window.selectedMessageIds = new Set();
window.__liveClockTimer = null;
window.manualOrderCatalog = [];
window.manualOrderLines = [];
window.masterOrderDraftItems = [];
window.masterOrderDraftMeta = { deliveryCharge: 0, discountAmount: 0, processingFee: 0, walletApplied: 0 };
window.masterOrderOriginalQtyMap = {};
window.masterOrderSearchMatches = [];
window.whatsappAlertPollTimer = null;
window.adminCourierConfig = { provider: 'steadfast', isConfigured: false, mockMode: true, supportsBooking: false };
window.selectedFilesAdd = new DataTransfer(); 
window.addProductCharCountersReady = false;
window.productHighlights = [];
window.aiGeneratedData = null;
window.globalCategories = [];
window.globalAttributes = [];
window.allCategories = [];
window.editingCategoryId = null;
window.categorySortable = null;
window.globalBrands = [];
window.globalNavbarLinks = [];
window.navbarLinkQuill = null;
window.globalCoupons = [];
window.couponStatusFilter = 'all';
window.currentSort = { key: 'productId', asc: false }; // ডিফল্ট সোর্টিং স্টেট
window.selectedProductIds = new Set();               // বাল্ক ডিলিটের জন্য চেক করা আইডি সেট
window.bulkImportSelectedFile = null;
window.selectedFilesEdit = new DataTransfer(); // এডিট মোডালের ইমেজ ট্র্যাকার
window._auditActiveTab = 'tab-login-history';
window.adminPaymentMethodsCache = [];
window.pmRemoveLogoFlag = false;
window.pmDragSourceId = null;
window.footerSettingsState = {
    copyrightText: '',
    columns: [],
    socialLinks: [],
    paymentGateways: [],
    paymentBadgesEnabled: true
};
window.pageContentCatalog = [];
window.pageContentQuill = null;
window.activePageSlug = '';
window.createPageSlugManual = false;
window.adminMessagesCache = [];
window.inquiryDetailActiveId = null;
window.messagesFilterTab = 'all';
window.messagesSearchQuery = '';

// Shared config used by admin-orders.js and admin-settings.js (ES modules do not
// see sibling-file `const` bindings — put these on window before any module runs).
window.LIVE_ORDERS_TABLE_COLS = 10;
window.ORDER_COURIER_SEND_CLASSES = 'order-courier-send send-courier-btn bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 w-full flex items-center justify-center py-2 text-xs font-semibold rounded-md shadow-sm gap-1.5 transition-colors duration-150';
window.ORDER_COURIER_SENT_CLASSES = 'order-courier-sent bg-emerald-50 text-emerald-700 border border-emerald-200 w-full flex items-center justify-center py-2 text-xs font-semibold rounded-md shadow-sm text-center';
window.COURIER_TRACKING_BASE_URLS = {
    steadfast: 'https://steadfast.com.bd/t/',
    pathao: 'https://merchant.pathao.com/tracking?consignment_id=',
    redx: 'https://redx.com.bd/track-global-parcel/?trackingId=',
    Steadfast: 'https://steadfast.com.bd/t/',
    Pathao: 'https://merchant.pathao.com/tracking?consignment_id=',
    RedX: 'https://redx.com.bd/track-global-parcel/?trackingId='
};
window.COURIER_PROVIDER_LABELS = {
    steadfast: 'Steadfast',
    pathao: 'Pathao',
    redx: 'RedX'
};
window.COURIER_BLOCKED_STATUSES = ['cancelled', 'canceled', 'returned', 'refunded', 'return requested'];

/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * Author: Abdul Karim
 * File: js/admin.js
 * Description: Unified Admin Engine - Combines Products, Orders, Customers, Analytics, Security & Settings.
 * Version: 2.0.0
 * Last Updated: June 2026
 */
