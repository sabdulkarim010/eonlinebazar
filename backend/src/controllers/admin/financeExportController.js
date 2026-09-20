/********************************************************************
 * Unified finance export — Excel (3 sheets) and PDF P&L report.
 ********************************************************************/

const { computeProfitLoss } = require('./profitLossController');
const { exportToExcel, exportToPDF } = require('../../services/exportService');

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

function formatMoney(amount) {
    const value = Number(amount) || 0;
    return `BDT ${value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolveQueryRange(query = {}) {
    return {
        startDate: query.from || query.startDate,
        endDate: query.to || query.endDate
    };
}

async function buildReport(query = {}) {
    return computeProfitLoss(resolveQueryRange(query));
}

function buildExcelSheets(report) {
    const period = `${report.period?.start || ''} — ${report.period?.end || ''}`;

    const revenueRows = [
        ['Financial Export — Revenue'],
        ['Period', period],
        [],
        ['Metric', 'Amount (BDT)'],
        ['Gross Revenue', report.revenue?.gross ?? 0],
        ['Returns', report.revenue?.returns ?? 0],
        ['Net Revenue', report.revenue?.net ?? 0],
        ['Delivered Orders', report.orders?.delivered ?? 0]
    ];

    const expenseRows = [
        ['Financial Export — Expenses'],
        ['Period', period],
        [],
        ['Category', 'Amount (BDT)']
    ];

    const expenses = report.costs?.expenses || {};
    Object.entries(expenses).forEach(([key, value]) => {
        expenseRows.push([EXPENSE_LABELS[key] || key, value]);
    });
    expenseRows.push([]);
    expenseRows.push(['Total Expenses', report.costs?.expensesTotal ?? 0]);
    expenseRows.push(['Buying (COGS)', report.costs?.buying ?? 0]);
    expenseRows.push(['Return Loss', report.costs?.returnLoss ?? 0]);
    expenseRows.push(['Cashback', report.costs?.cashback ?? 0]);
    expenseRows.push(['Discounts', report.costs?.discounts ?? 0]);

    const summaryRows = [
        ['Financial Export — Summary (P&L)'],
        ['Period', period],
        [],
        ['Line Item', 'Amount (BDT)'],
        ['Net Revenue', report.revenue?.net ?? 0],
        ['Total Costs', report.costs?.total ?? 0],
        ['Gross Profit', report.profit?.gross ?? 0],
        ['Net Profit', report.profit?.net ?? 0],
        ['Margin %', report.profit?.marginPercent ?? 0]
    ];

    return [
        { name: 'Revenue', rows: revenueRows },
        { name: 'Expenses', rows: expenseRows },
        { name: 'Summary', rows: summaryRows }
    ];
}

function buildPdfSections(report) {
    const period = `${report.period?.start || ''} — ${report.period?.end || ''}`;
    const expenseLines = Object.entries(report.costs?.expenses || {}).map(
        ([key, value]) => `${EXPENSE_LABELS[key] || key}: ${formatMoney(value)}`
    );

    return [
        {
            heading: `Profit & Loss Report (${period})`,
            lines: [
                `Gross Revenue: ${formatMoney(report.revenue?.gross)}`,
                `Returns: ${formatMoney(report.revenue?.returns)}`,
                `Net Revenue: ${formatMoney(report.revenue?.net)}`,
                `Total Costs: ${formatMoney(report.costs?.total)}`,
                `Gross Profit: ${formatMoney(report.profit?.gross)}`,
                `Net Profit: ${formatMoney(report.profit?.net)}`,
                `Margin: ${report.profit?.marginPercent ?? 0}%`
            ]
        },
        {
            heading: 'Expense Breakdown',
            lines: expenseLines.length ? expenseLines : ['No expenses recorded for this period.']
        }
    ];
}

exports.exportFinanceReport = async (req, res) => {
    try {
        const type = String(req.query.type || 'excel').trim().toLowerCase();
        const report = await buildReport(req.query);
        const stamp = new Date().toISOString().slice(0, 10);

        if (type === 'pdf') {
            const buffer = await exportToPDF('Profit & Loss Report', buildPdfSections(report));
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="finance-report-${stamp}.pdf"`);
            return res.send(buffer);
        }

        if (type === 'excel' || type === 'xlsx') {
            const buffer = exportToExcel(buildExcelSheets(report));
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="finance-report-${stamp}.xlsx"`);
            return res.send(buffer);
        }

        return res.status(400).json({
            success: false,
            message: 'Invalid export type. Use type=excel or type=pdf.'
        });
    } catch (err) {
        console.error('exportFinanceReport error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Export failed.' });
    }
};
