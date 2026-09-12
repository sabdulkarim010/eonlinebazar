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
const { computeProfitLoss } = require('./profitLossController');

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
 * Exports the order ledger as CSV for finance and fulfillment reporting.
 */
const exportOrdersCSV = async (req, res) => {
    try {
        const status = String(req.query.status || '').trim();
        const query = status && status !== 'all' ? { status } : {};
        const orders = await Order.find(query).sort({ createdAt: -1 }).limit(5000).lean();

        const rows = [
            csvRow(['Order ID', 'Date', 'Customer', 'Phone', 'Status', 'Subtotal', 'Delivery', 'Grand Total', 'Payment Method'])
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
                order.payment?.name || order.paymentMethod || ''
            ]));
        });

        const csv = `\uFEFF${rows.join('\r\n')}`;
        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="orders-export-${stamp}.csv"`);
        return res.send(csv);
    } catch (err) {
        console.error('Orders CSV export error:', err);
        return res.status(500).json({ success: false, message: 'Failed to export orders CSV.' });
    }
};

module.exports = {
    exportPLtoPDF,
    exportPLtoCSV,
    exportOrdersCSV
};
