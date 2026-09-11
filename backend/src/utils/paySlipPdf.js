/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: paySlipPdf.js
 * Location: backend/src/utils/paySlipPdf.js
 * Author: Abdul Karim Sheikh
 * Description: Branded PDF pay slip buffer for a payroll record — same
 * PDFKit layout language as invoicePdf.js so both documents look like
 * they came from the same store.
 ********************************************************************/

const PDFDocument = require('pdfkit');

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function formatCurrency(amount) {
    const value = Number(amount) || 0;
    return `BDT ${value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolvePeriodLabel(payroll = {}) {
    const month = Number(payroll.month);
    const name = MONTH_NAMES[month - 1] || 'Unknown';
    return `${name} ${payroll.year || ''}`.trim();
}

function drawSummaryRow(doc, label, value, y, options = {}) {
    const { bold = false, color = '#334155' } = options;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(color);
    doc.text(label, 320, y, { width: 130 });
    doc.text(value, 450, y, { width: 95, align: 'right' });
}

/**
 * Generate a pay slip PDF buffer for a payroll document.
 * @param {object} payroll - Plain payroll object from MongoDB
 * @returns {Promise<Buffer>}
 */
function generatePaySlipPdf(payroll = {}) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const period = resolvePeriodLabel(payroll);
            const slipNo = payroll._id ? String(payroll._id).slice(-6).toUpperCase() : 'N/A';
            const issuedOn = new Date().toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            // Brand header bar
            doc.rect(0, 0, doc.page.width, 90).fill('#2563eb');
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26)
                .text('EOnlineBazar', 50, 28);
            doc.font('Helvetica').fontSize(11)
                .text('Human Resource Management', 50, 58);

            doc.font('Helvetica-Bold').fontSize(12)
                .text('PAY SLIP', doc.page.width - 170, 32, { width: 120, align: 'right' });
            doc.font('Helvetica').fontSize(10)
                .text(`Slip #: ${slipNo}`, doc.page.width - 170, 52, { width: 120, align: 'right' })
                .text(`Issued: ${issuedOn}`, doc.page.width - 170, 66, { width: 120, align: 'right' });

            // Employee block
            doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(12).text('Employee', 50, 115);
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text(payroll.staffName || payroll.staffUsername || 'Staff', 50, 134);
            doc.text(`Username: ${payroll.staffUsername || 'N/A'}`, 50, 148);
            doc.text(`Pay Period: ${period}`, 50, 162);
            doc.text(`Status: ${String(payroll.status || 'draft').toUpperCase()}`, 50, 176);
            if (payroll.paymentMethod) {
                doc.text(`Payment Method: ${payroll.paymentMethod}`, 50, 190);
            }

            // Attendance block
            const attendanceTop = 225;
            doc.rect(50, attendanceTop, 240, 24).fill('#2563eb');
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
                .text('Attendance', 58, attendanceTop + 7);

            const attendanceRows = [
                ['Working Days', String(payroll.workingDays ?? 0)],
                ['Present Days', String(payroll.presentDays ?? 0)],
                ['Absent Days', String(payroll.absentDays ?? 0)],
                ['Late Days', String(payroll.lateDays ?? 0)],
                ['Overtime Hours', String(payroll.overtime ?? 0)]
            ];

            let rowY = attendanceTop + 24;
            attendanceRows.forEach(([label, value], index) => {
                if (index % 2 === 0) doc.rect(50, rowY, 240, 22).fill('#f8fafc');
                doc.font('Helvetica').fontSize(10).fillColor('#334155');
                doc.text(label, 58, rowY + 6, { width: 140 });
                doc.font('Helvetica-Bold').fillColor('#1e293b');
                doc.text(value, 198, rowY + 6, { width: 84, align: 'right' });
                rowY += 22;
            });

            // Earnings summary
            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(11)
                .text('Earnings & Deductions', 320, attendanceTop);

            let lineY = attendanceTop + 24;
            drawSummaryRow(doc, 'Base Salary', formatCurrency(payroll.baseSalary), lineY);
            lineY += 18;
            drawSummaryRow(doc, 'Bonus', formatCurrency(payroll.bonus), lineY);
            lineY += 18;
            drawSummaryRow(
                doc,
                `Overtime (${Number(payroll.overtime) || 0}h)`,
                formatCurrency(payroll.overtimeAmount),
                lineY
            );
            lineY += 18;
            drawSummaryRow(doc, 'Deductions', `- ${formatCurrency(payroll.deductions)}`, lineY, { color: '#dc2626' });
            lineY += 18;

            doc.moveTo(320, lineY + 6).lineTo(545, lineY + 6).strokeColor('#e2e8f0').stroke();
            lineY += 18;

            doc.font('Helvetica-Bold').fontSize(12).fillColor('#1e293b');
            doc.text('Net Payable', 320, lineY, { width: 130 });
            doc.fillColor('#2563eb').text(formatCurrency(payroll.totalSalary), 450, lineY, {
                width: 95,
                align: 'right'
            });

            if (payroll.paidAt) {
                lineY += 26;
                doc.font('Helvetica').fontSize(10).fillColor('#10b981')
                    .text(`Paid on ${new Date(payroll.paidAt).toLocaleDateString('en-US')}`, 320, lineY, {
                        width: 225,
                        align: 'right'
                    });
            }

            if (payroll.notes) {
                const notesTop = Math.max(rowY, lineY) + 40;
                doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text('Notes', 50, notesTop);
                doc.font('Helvetica').fontSize(10).fillColor('#334155')
                    .text(String(payroll.notes), 50, notesTop + 16, { width: 495 });
            }

            doc.font('Helvetica').fontSize(9).fillColor('#94a3b8')
                .text(
                    'This is a computer-generated pay slip and does not require a signature.',
                    50,
                    doc.page.height - 60,
                    { width: doc.page.width - 100, align: 'center' }
                );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    generatePaySlipPdf,
    resolvePeriodLabel,
    MONTH_NAMES
};
