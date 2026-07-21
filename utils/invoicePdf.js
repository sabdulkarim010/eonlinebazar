const PDFDocument = require('pdfkit');

function formatCurrency(amount) {
    const value = Number(amount) || 0;
    return `BDT ${value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolveOrderFinancials(order = {}) {
    const subTotal = Number(order.subTotal ?? order.subtotal) || 0;
    const discountAmount = Number(order.discountAmount) || 0;
    const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee) || 0;
    const grandTotal = Number(order.grandTotal ?? order.totalAmount)
        || Math.max(0, subTotal - discountAmount + deliveryCharge);

    return { subTotal, discountAmount, deliveryCharge, grandTotal };
}

function resolveInvoiceNumber(order = {}) {
    if (order.orderId) return String(order.orderId);
    if (order._id) return String(order._id).slice(-6).toUpperCase();
    return 'N/A';
}

function resolvePaymentStatus(order = {}) {
    const method = String(order.paymentMethod || 'COD').toUpperCase();
    const status = String(order.status || 'Pending').trim();
    const normalized = status.toLowerCase();

    if (normalized === 'cancelled' || normalized === 'canceled') {
        return `${method} — Cancelled`;
    }
    if (normalized === 'delivered') {
        return method === 'COD' ? 'Paid (Cash on Delivery)' : `${method} — Paid`;
    }
    if (method === 'COD') {
        return 'Pending (Cash on Delivery)';
    }
    return `${method} — ${status}`;
}

function drawTableRow(doc, columns, y, options = {}) {
    const { header = false, fontSize = 10 } = options;
    const startX = 50;
    const colWidths = [240, 60, 95, 100];
    let x = startX;

    doc.fontSize(fontSize);
    doc.fillColor(header ? '#ffffff' : '#1e293b');
    if (header) {
        doc.font('Helvetica-Bold');
    } else {
        doc.font('Helvetica');
    }

    columns.forEach((text, index) => {
        doc.text(String(text), x + 4, y + 6, {
            width: colWidths[index] - 8,
            align: index === 0 ? 'left' : 'right',
            ellipsis: true
        });
        x += colWidths[index];
    });
}

/**
 * Generate a branded PDF invoice buffer for an order document.
 * @param {object} order - Plain order object from MongoDB
 * @returns {Promise<Buffer>}
 */
function generateOrderInvoicePdf(order = {}) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const invoiceNo = resolveInvoiceNumber(order);
            const invoiceDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const financials = resolveOrderFinancials(order);
            const items = Array.isArray(order.items) ? order.items : [];

            // Brand header bar
            doc.rect(0, 0, doc.page.width, 90).fill('#2563eb');
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26)
                .text('EOnlineBazar', 50, 28);
            doc.font('Helvetica').fontSize(11)
                .text('Your Trusted Online Marketplace', 50, 58);

            doc.font('Helvetica-Bold').fontSize(12)
                .text('INVOICE', doc.page.width - 170, 32, { width: 120, align: 'right' });
            doc.font('Helvetica').fontSize(10)
                .text(`Invoice #: ${invoiceNo}`, doc.page.width - 170, 52, { width: 120, align: 'right' })
                .text(`Date: ${invoiceDate}`, doc.page.width - 170, 66, { width: 120, align: 'right' });

            doc.moveDown(3);
            doc.fillColor('#1e293b');

            // Customer block
            doc.font('Helvetica-Bold').fontSize(12).text('Bill To', 50, 110);
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text(order.customerName || 'Customer', 50, 128);
            doc.text(`Phone: ${order.customerPhone || 'N/A'}`, 50, 142);
            doc.text(`Address: ${order.customerAddress || 'N/A'}`, 50, 156, { width: 320 });

            if (order.shippingDistrict) {
                doc.text(`District: ${order.shippingDistrict}`, 50, 184);
            }
            if (order.shippingLocationType) {
                doc.text(`Delivery Zone: ${order.shippingLocationType}`, 50, 198);
            }

            // Items table header
            const tableTop = 230;
            doc.rect(50, tableTop, 495, 24).fill('#2563eb');
            drawTableRow(doc, ['Product', 'Qty', 'Unit Price', 'Line Total'], tableTop, { header: true });

            let rowY = tableTop + 24;
            doc.fillColor('#1e293b');

            if (items.length === 0) {
                doc.rect(50, rowY, 495, 24).fill('#f8fafc');
                drawTableRow(doc, ['No items found', '—', '—', '—'], rowY);
                rowY += 24;
            } else {
                items.forEach((item, index) => {
                    const qty = Number(item.quantity) || 1;
                    const unitPrice = Number(item.price) || 0;
                    const lineTotal = unitPrice * qty;
                    const name = item.name || 'Product';
                    const variant = item.variantLabel ? ` (${item.variantLabel})` : '';

                    if (index % 2 === 0) {
                        doc.rect(50, rowY, 495, 24).fill('#f8fafc');
                    }
                    drawTableRow(doc, [
                        `${name}${variant}`,
                        qty,
                        formatCurrency(unitPrice),
                        formatCurrency(lineTotal)
                    ], rowY);
                    rowY += 24;

                    if (rowY > doc.page.height - 180) {
                        doc.addPage();
                        rowY = 50;
                    }
                });
            }

            // Payment summary
            const summaryTop = Math.max(rowY + 24, 320);
            const summaryX = 320;
            const summaryWidth = 225;

            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(11)
                .text('Payment Summary', summaryX, summaryTop);

            let lineY = summaryTop + 22;
            const summaryLines = [
                ['Subtotal', formatCurrency(financials.subTotal)],
                ['Shipping Fee', financials.deliveryCharge === 0 ? 'Free' : formatCurrency(financials.deliveryCharge)]
            ];

            if (financials.discountAmount > 0) {
                const couponLabel = order.couponCode ? `Discount (${order.couponCode})` : 'Discount';
                summaryLines.push([couponLabel, `- ${formatCurrency(financials.discountAmount)}`]);
            }

            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            summaryLines.forEach(([label, value]) => {
                doc.text(label, summaryX, lineY, { width: 120 });
                doc.text(value, summaryX + 120, lineY, { width: 105, align: 'right' });
                lineY += 18;
            });

            doc.moveTo(summaryX, lineY + 4).lineTo(summaryX + summaryWidth, lineY + 4)
                .strokeColor('#e2e8f0').stroke();

            lineY += 14;
            doc.font('Helvetica-Bold').fontSize(12).fillColor('#1e293b');
            doc.text('Grand Total', summaryX, lineY);
            doc.fillColor('#2563eb').text(formatCurrency(financials.grandTotal), summaryX + 120, lineY, {
                width: 105,
                align: 'right'
            });

            lineY += 28;
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text('Payment Status:', summaryX, lineY);
            doc.font('Helvetica-Bold').fillColor('#10b981')
                .text(resolvePaymentStatus(order), summaryX + 95, lineY, { width: 130 });

            // Footer
            doc.font('Helvetica').fontSize(9).fillColor('#94a3b8')
                .text(
                    'Thank you for shopping with EOnlineBazar. For support, visit your profile or contact our team.',
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
    generateOrderInvoicePdf,
    resolveInvoiceNumber
};
