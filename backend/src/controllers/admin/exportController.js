/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: exportController.js
 * Location: controllers/admin/exportController.js
 * Author: Abdul Karim Sheikh
 * Description: Profit & Loss export endpoints — a branded PDFKit document
 * and a plain CSV, both built from the shared computeProfitLoss() engine
 * so the exported figures always match the on-screen report.
 ********************************************************************/

const PDFDocument = require('pdfkit');
const Order = require('../../models/order');
const Product = require('../../models/product');
const User = require('../../models/user');
const Employee = require('../../models/employee');
const Settings = require('../../models/Settings');
const { computeProfitLoss } = require('./profitLossController');

const DEFAULT_LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_DEFAULT_THRESHOLD) || 10;
const EXPORT_ROW_LIMIT = 10000;

const VIP_DEFAULTS = {
    vipMinTotalSpent: 10000,
    vipMinOrderCount: 10,
    frequentBuyerMinOrders: 3
};

const EXPENSE_LABELS = {
    office_rent: 'Office Rent',
    utilities: 'Utilities',
    staff_salary: 'Staff Salary',
    marketing: 'Marketing',
    courier_charges: 'Courier Charges',
    packaging: 'Packaging',
    equipment: 'Equipment',
    other: 'Other'
};

function formatCurrency(amount) {
    const value = Number(amount) || 0;
    return `BDT ${value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Escape one CSV cell (quote wrap + double-quote escaping). */
function csvCell(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function csvRow(cells) {
    return cells.map(csvCell).join(',');
}

function sendCsvResponse(res, filename, rows) {
    const csv = `\uFEFF${rows.join('\r\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hydrateCustomerName(customer = {}) {
    const fromParts = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    const legacy = customer.name ? String(customer.name).trim() : '';
    return fromParts || legacy || '';
}

function resolveCustomerSegment(userStats = {}, thresholds = VIP_DEFAULTS) {
    const orderCount = Number(userStats.orderCount) || 0;
    const totalSpent = Number(userStats.totalSpent) || 0;
    const vipMinSpent = Number(thresholds.vipMinTotalSpent ?? VIP_DEFAULTS.vipMinTotalSpent);
    const vipMinOrders = Number(thresholds.vipMinOrderCount ?? VIP_DEFAULTS.vipMinOrderCount);
    const frequentMin = Number(thresholds.frequentBuyerMinOrders ?? VIP_DEFAULTS.frequentBuyerMinOrders);

    const isVip = totalSpent >= vipMinSpent || orderCount >= vipMinOrders;
    const isFrequent = !isVip && orderCount >= frequentMin;
    const isInactive = orderCount === 0;

    let segment = 'all';
    if (isInactive) segment = 'inactive';
    else if (isVip) segment = 'vip';
    else if (isFrequent) segment = 'frequent';

    return { orderCount, totalSpent, segment, isVip, isFrequentBuyer: isFrequent, isInactive };
}

function buildOrderExportFilter(query = {}) {
    const filter = {};
    const status = String(query.status || '').trim();
    if (status && status !== 'all') {
        filter.status = status;
    }

    const search = String(query.search || '').trim();
    if (search) {
        const escaped = escapeRegex(search);
        filter.$or = [
            { orderId: { $regex: escaped, $options: 'i' } },
            { customerName: { $regex: escaped, $options: 'i' } },
            { customerPhone: { $regex: escaped, $options: 'i' } }
        ];
    }

    const date = String(query.date || query.startDate || '').trim();
    if (date) {
        const dayStart = new Date(date);
        if (!Number.isNaN(dayStart.getTime())) {
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);
            filter.createdAt = { $gte: dayStart, $lt: dayEnd };
        }
    }

    const sandbox = String(query.sandbox || '').trim().toLowerCase();
    if (sandbox === 'live') {
        filter.isSandbox = { $ne: true };
    } else if (sandbox === 'test') {
        filter.isSandbox = true;
    }

    return filter;
}

function buildProductExportFilter(query = {}) {
    const filter = {
        $or: [
            { status: { $exists: false } },
            { status: { $nin: ['inactive', 'deleted'] } }
        ]
    };

    const search = String(query.search || '').trim().toLowerCase();
    const category = String(query.category || '').trim();
    const stockStatus = String(query.stockStatus || '').trim();
    const priceRange = String(query.priceRange || '').trim();

    if (search) {
        const escaped = escapeRegex(search);
        filter.$and = filter.$and || [];
        filter.$and.push({
            $or: [
                { name: { $regex: escaped, $options: 'i' } },
                { productId: { $regex: escaped, $options: 'i' } },
                { category: { $regex: escaped, $options: 'i' } }
            ]
        });
    }

    if (category && category !== 'All') {
        filter.category = category;
    }

    if (stockStatus === 'OutOfStock') {
        filter.$and = filter.$and || [];
        filter.$and.push({
            $or: [
                { stockQuantity: 0 },
                { stockQuantity: { $exists: false }, stock: 0 }
            ]
        });
    } else if (stockStatus === 'InStock' || stockStatus === 'LowStock') {
        filter.$and = filter.$and || [];
        filter.$and.push({
            $expr: {
                $gt: [{ $ifNull: ['$stockQuantity', '$stock'] }, 0]
            }
        });
    }

    if (priceRange === '0-500') {
        filter.price = { $lte: 500 };
    } else if (priceRange === '500-2000') {
        filter.price = { $gt: 500, $lte: 2000 };
    } else if (priceRange === '2000+') {
        filter.price = { $gt: 2000 };
    }

    return { filter, stockStatus, search, category, priceRange };
}

function productMatchesStockExport(doc, stockStatus) {
    if (!stockStatus || stockStatus === 'All') return true;
    const stockNum = Number(doc.stockQuantity ?? doc.stock ?? 0);
    const threshold = Number(doc.lowStockThreshold) > 0 ? Number(doc.lowStockThreshold) : DEFAULT_LOW_STOCK_THRESHOLD;
    if (stockStatus === 'InStock') return stockNum >= threshold;
    if (stockStatus === 'LowStock') return stockNum > 0 && stockNum < threshold;
    if (stockStatus === 'OutOfStock') return stockNum <= 0;
    return true;
}

/**
 * GET /api/admin/finance/profit-loss/export-pdf
 */
const exportPLtoPDF = async (req, res) => {
    try {
        const report = await computeProfitLoss(req.query);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const filename = `profit-loss-${report.period.start.slice(0, 10)}_to_${report.period.end.slice(0, 10)}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);

        // Brand header bar
        doc.rect(0, 0, doc.page.width, 90).fill('#2563eb');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26).text('EOnlineBazar', 50, 28);
        doc.font('Helvetica').fontSize(11).text('Profit & Loss Report', 50, 58);
        doc.font('Helvetica').fontSize(10)
            .text(
                `${formatDateLabel(report.period.start)} — ${formatDateLabel(report.period.end)}`,
                doc.page.width - 250,
                58,
                { width: 200, align: 'right' }
            );

        let y = 120;

        const sectionHeader = (title) => {
            doc.rect(50, y, doc.page.width - 100, 24).fill('#eff6ff');
            doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(12).text(title, 58, y + 6);
            y += 34;
        };

        const line = (label, value, options = {}) => {
            const { bold = false, color = '#334155' } = options;
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(color);
            doc.text(label, 58, y, { width: 320 });
            doc.text(value, doc.page.width - 250, y, { width: 200, align: 'right' });
            y += 18;
        };

        // Revenue
        sectionHeader('Revenue');
        line('Gross Revenue', formatCurrency(report.revenue.gross));
        line('Returns Deducted', `- ${formatCurrency(report.revenue.returns)}`, { color: '#dc2626' });
        line('Net Revenue', formatCurrency(report.revenue.net), { bold: true, color: '#1e293b' });
        y += 8;

        // Costs
        sectionHeader('Costs');
        line('Product Buying Cost (COGS)', formatCurrency(report.costs.buying));
        line('Courier Charges', formatCurrency(report.costs.courier));
        line('Return Losses', formatCurrency(report.costs.returnLoss));
        line('Cashback Given', formatCurrency(report.costs.cashback));
        line('Discounts Given', formatCurrency(report.costs.discounts));
        Object.entries(report.costs.expenses || {}).forEach(([cat, total]) => {
            if (total > 0) line(`  ${EXPENSE_LABELS[cat] || cat}`, formatCurrency(total));
        });
        line('Total Costs', formatCurrency(report.costs.total), { bold: true, color: '#1e293b' });
        y += 8;

        // Profit
        sectionHeader('Profit');
        line('Gross Profit', formatCurrency(report.profit.gross));
        const profitColor = report.profit.net >= 0 ? '#16a34a' : '#dc2626';
        line('Net Profit', formatCurrency(report.profit.net), { bold: true, color: profitColor });
        line('Net Profit Margin', `${report.profit.marginPercent}%`, { bold: true, color: profitColor });
        y += 12;

        // Top products
        if (Array.isArray(report.topProducts) && report.topProducts.length) {
            if (y > doc.page.height - 200) { doc.addPage(); y = 60; }
            sectionHeader('Top Profitable Products');
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b');
            doc.text('Product', 58, y, { width: 240 });
            doc.text('Revenue', 300, y, { width: 90, align: 'right' });
            doc.text('Profit', 430, y, { width: 90, align: 'right' });
            y += 16;
            report.topProducts.slice(0, 10).forEach((p) => {
                if (y > doc.page.height - 60) { doc.addPage(); y = 60; }
                doc.font('Helvetica').fontSize(9).fillColor('#334155');
                doc.text(p.name, 58, y, { width: 240, ellipsis: true });
                doc.text(formatCurrency(p.revenue), 300, y, { width: 90, align: 'right' });
                doc.fillColor(p.profit >= 0 ? '#16a34a' : '#dc2626')
                    .text(formatCurrency(p.profit), 430, y, { width: 90, align: 'right' });
                y += 15;
            });
        }

        doc.font('Helvetica').fontSize(9).fillColor('#94a3b8')
            .text(
                'Computer-generated Profit & Loss report — EOnlineBazar Finance.',
                50,
                doc.page.height - 50,
                { width: doc.page.width - 100, align: 'center' }
            );

        doc.end();
    } catch (err) {
        console.error('🔴 P&L PDF export error:', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Failed to generate P&L PDF.' });
        } else {
            res.end();
        }
    }
};

/**
 * GET /api/admin/finance/profit-loss/export-csv
 */
const exportPLtoCSV = async (req, res) => {
    try {
        const report = await computeProfitLoss(req.query);
        const rows = [];

        rows.push(csvRow(['EOnlineBazar — Profit & Loss Report']));
        rows.push(csvRow(['Period Start', formatDateLabel(report.period.start)]));
        rows.push(csvRow(['Period End', formatDateLabel(report.period.end)]));
        rows.push(csvRow(['Currency', report.currency]));
        rows.push('');

        rows.push(csvRow(['REVENUE', 'Amount (BDT)']));
        rows.push(csvRow(['Gross Revenue', report.revenue.gross]));
        rows.push(csvRow(['Returns Deducted', report.revenue.returns]));
        rows.push(csvRow(['Net Revenue', report.revenue.net]));
        rows.push('');

        rows.push(csvRow(['COSTS', 'Amount (BDT)']));
        rows.push(csvRow(['Product Buying Cost (COGS)', report.costs.buying]));
        rows.push(csvRow(['Courier Charges', report.costs.courier]));
        rows.push(csvRow(['Return Losses', report.costs.returnLoss]));
        rows.push(csvRow(['Cashback Given', report.costs.cashback]));
        rows.push(csvRow(['Discounts Given', report.costs.discounts]));
        Object.entries(report.costs.expenses || {}).forEach(([cat, total]) => {
            rows.push(csvRow([`Expense: ${EXPENSE_LABELS[cat] || cat}`, total]));
        });
        rows.push(csvRow(['Total Costs', report.costs.total]));
        rows.push('');

        rows.push(csvRow(['PROFIT', 'Amount (BDT)']));
        rows.push(csvRow(['Gross Profit', report.profit.gross]));
        rows.push(csvRow(['Net Profit', report.profit.net]));
        rows.push(csvRow(['Net Profit Margin %', report.profit.marginPercent]));
        rows.push('');

        rows.push(csvRow(['TOP PROFITABLE PRODUCTS']));
        rows.push(csvRow(['Product', 'Revenue', 'Buying Cost', 'Profit']));
        (report.topProducts || []).forEach((p) => {
            rows.push(csvRow([p.name, p.revenue, p.buyingCost, p.profit]));
        });
        rows.push('');

        rows.push(csvRow(['WORST PERFORMING PRODUCTS']));
        rows.push(csvRow(['Product', 'Revenue', 'Buying Cost', 'Loss']));
        (report.worstProducts || []).forEach((p) => {
            rows.push(csvRow([p.name, p.revenue, p.buyingCost, p.loss]));
        });

        const csv = `\uFEFF${rows.join('\r\n')}`;
        const filename = `profit-loss-${report.period.start.slice(0, 10)}_to_${report.period.end.slice(0, 10)}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
    } catch (err) {
        console.error('🔴 P&L CSV export error:', err);
        return res.status(500).json({ success: false, message: 'Failed to generate P&L CSV.' });
    }
};

/**
 * GET /api/admin/orders/export-csv
 * GET /api/admin/orders/export
 * Exports the order ledger as CSV for finance and fulfillment reporting.
 */
const exportOrdersCSV = async (req, res) => {
    try {
        const filter = buildOrderExportFilter(req.query);
        const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).lean();

        const rows = [
            csvRow(['Order ID', 'Date', 'Customer', 'Phone', 'Status', 'Subtotal', 'Delivery', 'Grand Total', 'Payment Method', 'Sandbox'])
        ];

        orders.forEach((order) => {
            rows.push(csvRow([
                order.orderId || String(order._id),
                order.createdAt ? new Date(order.createdAt).toISOString() : '',
                order.customerName || '',
                order.customerPhone || '',
                order.status || '',
                order.subTotal ?? '',
                order.deliveryCharge ?? '',
                order.grandTotal ?? order.total ?? '',
                order.payment?.name || order.paymentMethod || '',
                order.isSandbox ? 'yes' : 'no'
            ]));
        });

        const stamp = new Date().toISOString().slice(0, 10);
        return sendCsvResponse(res, `orders-export-${stamp}.csv`, rows);
    } catch (err) {
        console.error('Orders CSV export error:', err);
        return res.status(500).json({ success: false, message: 'Failed to export orders CSV.' });
    }
};

/**
 * GET /api/admin/customers/export
 */
const exportCustomersCSV = async (req, res) => {
    try {
        const tierFilter = String(req.query.tier || '').trim().toLowerCase();
        const segmentFilter = String(req.query.segment || '').trim().toLowerCase();
        const search = String(req.query.search || '').trim();
        const validTiers = ['none', 'silver', 'gold', 'platinum'];

        const listFilter = {};
        if (search) {
            const escaped = escapeRegex(search);
            const phoneDigits = search.replace(/\D/g, '');
            const orClauses = [
                { email: { $regex: escaped, $options: 'i' } },
                { firstName: { $regex: escaped, $options: 'i' } },
                { lastName: { $regex: escaped, $options: 'i' } },
                { mobile: { $regex: escaped, $options: 'i' } }
            ];
            if (phoneDigits.length >= 6) {
                orClauses.push({ mobile: { $regex: phoneDigits, $options: 'i' } });
            }
            listFilter.$or = orClauses;
        }
        if (tierFilter && validTiers.includes(tierFilter)) {
            listFilter.loyaltyTier = tierFilter;
        }

        const [customers, masterSettings] = await Promise.all([
            User.find(listFilter).select('-password').sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).lean(),
            Settings.getOrCreate()
        ]);

        const customerIds = customers.map((c) => c._id);
        const orderStats = customerIds.length
            ? await Order.aggregate([
                {
                    $match: {
                        user: { $in: customerIds },
                        status: { $nin: ['Cancelled', 'Canceled'] }
                    }
                },
                {
                    $group: {
                        _id: '$user',
                        orderCount: { $sum: 1 },
                        totalSpent: {
                            $sum: {
                                $add: [
                                    { $ifNull: ['$grandTotal', 0] },
                                    { $ifNull: ['$walletApplied', 0] }
                                ]
                            }
                        }
                    }
                }
            ])
            : [];

        const statsMap = new Map(
            orderStats.map((row) => [String(row._id), {
                orderCount: row.orderCount || 0,
                totalSpent: Math.round(Number(row.totalSpent) || 0)
            }])
        );

        const thresholds = {
            vipMinTotalSpent: masterSettings.vipMinTotalSpent,
            vipMinOrderCount: masterSettings.vipMinOrderCount,
            frequentBuyerMinOrders: masterSettings.frequentBuyerMinOrders
        };

        const rows = [
            csvRow(['User ID', 'Full Name', 'Email', 'Phone', 'Orders', 'Total Spent', 'Tier', 'Segment', 'Status'])
        ];

        customers.forEach((customer) => {
            const stats = statsMap.get(String(customer._id)) || { orderCount: 0, totalSpent: 0 };
            const segmentMeta = resolveCustomerSegment(stats, thresholds);

            if (segmentFilter && segmentFilter !== 'all') {
                if (segmentFilter === 'vip' && !segmentMeta.isVip) return;
                if (segmentFilter === 'frequent' && !segmentMeta.isFrequentBuyer) return;
                if (segmentFilter === 'inactive' && !segmentMeta.isInactive) return;
            }

            rows.push(csvRow([
                customer._id,
                hydrateCustomerName(customer),
                customer.email || '',
                customer.mobile || '',
                segmentMeta.orderCount,
                segmentMeta.totalSpent,
                customer.loyaltyTier || 'none',
                segmentMeta.segment,
                customer.status || 'active'
            ]));
        });

        const stamp = new Date().toISOString().slice(0, 10);
        return sendCsvResponse(res, `customers-export-${stamp}.csv`, rows);
    } catch (err) {
        console.error('Customers CSV export error:', err);
        return res.status(500).json({ success: false, message: 'Failed to export customers CSV.' });
    }
};

/**
 * GET /api/admin/products/export
 */
const exportProductsCSV = async (req, res) => {
    try {
        const { filter, stockStatus } = buildProductExportFilter(req.query);
        let products = await Product.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).lean();
        products = products.filter((p) => productMatchesStockExport(p, stockStatus));

        const rows = [
            csvRow(['Product ID', 'Name', 'Category', 'Sell Price', 'Buy Price', 'Stock', 'Low Stock Threshold', 'Status'])
        ];

        products.forEach((product) => {
            rows.push(csvRow([
                product.productId || String(product._id),
                product.name || '',
                product.category || '',
                product.price ?? '',
                product.buyingPrice ?? '',
                product.stockQuantity ?? product.stock ?? 0,
                product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
                product.status || 'active'
            ]));
        });

        const stamp = new Date().toISOString().slice(0, 10);
        return sendCsvResponse(res, `products-export-${stamp}.csv`, rows);
    } catch (err) {
        console.error('Products CSV export error:', err);
        return res.status(500).json({ success: false, message: 'Failed to export products CSV.' });
    }
};

/**
 * GET /api/admin/hrm/employees/export
 */
const exportEmployeesCSV = async (req, res) => {
    try {
        const filter = {};
        const { EMPLOYEE_STATUSES, EMPLOYEE_TYPES } = Employee;

        const status = String(req.query.status || '').trim().toLowerCase();
        if (EMPLOYEE_STATUSES.includes(status)) filter.status = status;

        const department = String(req.query.department || '').trim();
        if (department) filter.department = department;

        const designation = String(req.query.designation || '').trim();
        if (designation) filter.designation = designation;

        const employeeType = String(req.query.employeeType || '').trim().toLowerCase();
        if (EMPLOYEE_TYPES.includes(employeeType)) filter.employeeType = employeeType;

        const search = String(req.query.search || '').trim();
        if (search) {
            const re = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ fullName: re }, { phone: re }, { employeeId: re }, { role: re }, { designation: re }];
        }

        const employees = await Employee.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).lean();

        const rows = [
            csvRow(['Employee ID', 'Full Name', 'Phone', 'Email', 'Department', 'Designation', 'Type', 'Status', 'Join Date', 'Salary'])
        ];

        employees.forEach((employee) => {
            rows.push(csvRow([
                employee.employeeId || String(employee._id),
                employee.fullName || '',
                employee.phone || '',
                employee.email || '',
                employee.department || '',
                employee.designation || '',
                employee.employeeType || '',
                employee.status || '',
                employee.joinDate ? new Date(employee.joinDate).toISOString().slice(0, 10) : '',
                employee.salary ?? employee.basicSalary ?? ''
            ]));
        });

        const stamp = new Date().toISOString().slice(0, 10);
        return sendCsvResponse(res, `employees-export-${stamp}.csv`, rows);
    } catch (err) {
        console.error('Employees CSV export error:', err);
        return res.status(500).json({ success: false, message: 'Failed to export employees CSV.' });
    }
};

module.exports = {
    exportPLtoPDF,
    exportPLtoCSV,
    exportOrdersCSV,
    exportCustomersCSV,
    exportProductsCSV,
    exportEmployeesCSV
};
