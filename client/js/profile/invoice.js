/**
 * Customer invoice render, print, and PDF download (server-authoritative totals).
 */
(function initEOBInvoice(global) {
    'use strict';

    const DEFAULT_COMPANY = {
        name: 'EonlineBazar',
        tagline: 'Your Trusted Online Marketplace',
        address: 'Dhaka, Bangladesh',
        supportEmail: 'support@eonlinebazar.com',
        supportPhone: '+880 9612-345678'
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatMoneyBdt(amount) {
        const n = Number(amount) || 0;
        return `৳${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function resolveInvoiceNumber(order) {
        if (order?.orderId) return String(order.orderId);
        if (order?._id) return String(order._id).slice(-6).toUpperCase();
        return 'N/A';
    }

    /** Mirror backend invoicePdf financial fields — no client-side grand total recomputation. */
    function extractOrderFinancials(order = {}) {
        return {
            subTotal: Number(order.subTotal ?? order.subtotal) || 0,
            discountAmount: Number(order.discountAmount) || 0,
            deliveryCharge: Number(order.deliveryCharge ?? order.shippingFee) || 0,
            vatAmount: Number(order.vatAmount ?? order.taxAmount) || 0,
            processingFee: Number(order.processingFee ?? order.payment?.processingFee) || 0,
            grandTotal: Number(order.grandTotal ?? order.totalAmount) || 0
        };
    }

    function resolveVariantLabel(item = {}) {
        if (item.variantLabel) return String(item.variantLabel);
        const parts = [item.variantAttribute, item.variantValue].filter(Boolean);
        if (parts.length) return parts.join(': ');
        if (item.variantId) return String(item.variantId);
        return '';
    }

    function resolvePaymentStamp(order = {}) {
        const payStatus = String(order.payment?.status || order.paymentStatus || '').toLowerCase();
        const methodRaw = String(order.paymentMethod || order.payment?.name || order.payment?.method || 'COD');
        const method = methodRaw.toUpperCase();
        const isCod = method.includes('COD') || method.includes('CASH');

        if (payStatus === 'paid' || payStatus === 'verified' || payStatus === 'approved') {
            return { label: 'PAID', className: 'eob-invoice-stamp--paid' };
        }
        if (isCod) {
            return { label: 'CASH ON DELIVERY', className: 'eob-invoice-stamp--cod' };
        }
        if (payStatus === 'pending' || payStatus === 'unpaid' || !payStatus) {
            return { label: 'PENDING', className: 'eob-invoice-stamp--pending' };
        }
        return { label: method, className: 'eob-invoice-stamp--pending' };
    }

    function buildInvoiceViewModel(order = {}, companyOverride = {}) {
        const financials = extractOrderFinancials(order);
        const items = (Array.isArray(order.items) ? order.items : []).map((item) => {
            const qty = Math.max(1, Number(item.quantity) || 1);
            const unitPrice = Number(item.price) || 0;
            return {
                sku: String(item.variantSku || item.sku || item.productSku || '—'),
                title: item.name || item.product?.name || 'Product',
                variant: resolveVariantLabel(item),
                quantity: qty,
                unitPrice,
                lineTotal: unitPrice * qty
            };
        });

        const vatPct = Number(order.vatPercentage ?? order.vatRate) || 0;
        const taxMode = String(order.priceTaxMode || '').toUpperCase();
        let taxLabel = 'VAT / Tax';
        if (vatPct > 0) {
            taxLabel = taxMode === 'INCLUSIVE'
                ? `VAT (${vatPct}% included)`
                : `VAT / Tax (${vatPct}%)`;
        }

        const couponCode = order.couponCode ? String(order.couponCode) : '';

        return {
            company: { ...DEFAULT_COMPANY, ...companyOverride },
            invoiceNumber: resolveInvoiceNumber(order),
            orderDate: order.createdAt
                ? new Date(order.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
                : '',
            paymentMethod: order.payment?.name || order.paymentMethod || 'N/A',
            paymentStamp: resolvePaymentStamp(order),
            billedTo: {
                name: order.customerName || 'Customer',
                phone: order.customerPhone || '',
                address: order.customerAddress || ''
            },
            shippedTo: {
                address: order.customerAddress || '',
                district: order.shippingDistrict || '',
                zone: order.shippingLocationType || order.deliveryLocationType || ''
            },
            items,
            financials,
            couponCode,
            taxLabel,
            taxRegistrationNumber: order.taxRegistrationNumber || ''
        };
    }

    function renderInvoiceHtml(model) {
        if (!model) return '';
        const rows = (model.items || []).map((line) => `
            <tr>
                <td>${escapeHtml(line.sku)}</td>
                <td>
                    <strong>${escapeHtml(line.title)}</strong>
                    ${line.variant ? `<div class="eob-invoice-variant">${escapeHtml(line.variant)}</div>` : ''}
                </td>
                <td class="num">${formatMoneyBdt(line.unitPrice)}</td>
                <td class="num">${line.quantity}</td>
                <td class="num">${formatMoneyBdt(line.lineTotal)}</td>
            </tr>
        `).join('');

        const fin = model.financials || {};
        const discountRow = fin.discountAmount > 0
            ? `<div class="eob-invoice-summary-row"><span>Discount${model.couponCode ? ` (${escapeHtml(model.couponCode)})` : ''}</span><strong>-${formatMoneyBdt(fin.discountAmount)}</strong></div>`
            : '';
        const vatRow = fin.vatAmount > 0
            ? `<div class="eob-invoice-summary-row"><span>${escapeHtml(model.taxLabel)}</span><strong>${formatMoneyBdt(fin.vatAmount)}</strong></div>`
            : '';
        const feeRow = fin.processingFee > 0
            ? `<div class="eob-invoice-summary-row"><span>Payment processing fee</span><strong>${formatMoneyBdt(fin.processingFee)}</strong></div>`
            : '';

        return `
            <article class="eob-invoice" data-invoice-id="${escapeHtml(model.invoiceNumber)}">
                <div class="eob-invoice-stamp ${model.paymentStamp.className}" aria-hidden="true">${escapeHtml(model.paymentStamp.label)}</div>
                <header class="eob-invoice-header">
                    <div>
                        <h1>${escapeHtml(model.company.name)}</h1>
                        <p>${escapeHtml(model.company.tagline)}</p>
                        <p class="eob-invoice-company-meta">${escapeHtml(model.company.address)}</p>
                        <p class="eob-invoice-company-meta">${escapeHtml(model.company.supportEmail)} · ${escapeHtml(model.company.supportPhone)}</p>
                    </div>
                    <div class="eob-invoice-meta">
                        <p><strong>Invoice #</strong> ${escapeHtml(model.invoiceNumber)}</p>
                        <p><strong>Order date</strong> ${escapeHtml(model.orderDate)}</p>
                        <p><strong>Payment</strong> ${escapeHtml(model.paymentMethod)}</p>
                    </div>
                </header>
                <section class="eob-invoice-addresses">
                    <div>
                        <h2>Billed To</h2>
                        <p>${escapeHtml(model.billedTo.name)}</p>
                        <p>${escapeHtml(model.billedTo.phone)}</p>
                        <p>${escapeHtml(model.billedTo.address)}</p>
                    </div>
                    <div>
                        <h2>Shipped To</h2>
                        <p>${escapeHtml(model.shippedTo.address)}</p>
                        ${model.shippedTo.district ? `<p>District: ${escapeHtml(model.shippedTo.district)}</p>` : ''}
                        ${model.shippedTo.zone ? `<p>Zone: ${escapeHtml(String(model.shippedTo.zone))}</p>` : ''}
                    </div>
                </section>
                <table class="eob-invoice-table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Product</th>
                            <th>Unit Price</th>
                            <th>Qty</th>
                            <th>Line Total</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="5">No line items</td></tr>'}</tbody>
                </table>
                <section class="eob-invoice-summary">
                    <div class="eob-invoice-summary-row"><span>Item subtotal</span><strong>${formatMoneyBdt(fin.subTotal)}</strong></div>
                    ${discountRow}
                    ${vatRow}
                    <div class="eob-invoice-summary-row"><span>Shipping</span><strong>${fin.deliveryCharge === 0 ? 'Free' : formatMoneyBdt(fin.deliveryCharge)}</strong></div>
                    ${feeRow}
                    <div class="eob-invoice-summary-row eob-invoice-summary-row--total"><span>Amount paid</span><strong>${formatMoneyBdt(fin.grandTotal)}</strong></div>
                    <p class="eob-invoice-payment-status">Payment status: <strong>${escapeHtml(model.paymentStamp.label)}</strong></p>
                    ${model.taxRegistrationNumber ? `<p class="eob-invoice-tax-reg">Tax registration: ${escapeHtml(model.taxRegistrationNumber)}</p>` : ''}
                </section>
            </article>
        `;
    }

    const PRINT_FRAME_ID = 'eob-invoice-print-frame';

    function getOrCreatePrintFrame() {
        if (typeof document === 'undefined') return null;
        let frame = document.getElementById(PRINT_FRAME_ID);
        if (!frame) {
            frame = document.createElement('iframe');
            frame.id = PRINT_FRAME_ID;
            frame.setAttribute('title', 'Print receipt');
            frame.setAttribute('aria-hidden', 'true');
            frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
            document.body.appendChild(frame);
        }
        return frame;
    }

    function printHtmlViaHiddenFrame(html) {
        const frame = getOrCreatePrintFrame();
        const win = frame?.contentWindow;
        const doc = frame?.contentDocument || win?.document;
        if (!frame || !doc || !win) return false;

        const markup = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
            <link rel="stylesheet" href="/css/invoice.css">
            </head><body class="eob-invoice-print-body">${html}</body></html>`;

        const runPrint = () => {
            try {
                win.focus();
                win.print();
                return true;
            } catch (_) {
                return false;
            }
        };

        doc.open();
        doc.write(markup);
        doc.close();

        if (doc.readyState === 'complete') {
            global.setTimeout(runPrint, 150);
        } else {
            frame.onload = () => global.setTimeout(runPrint, 150);
        }
        return true;
    }

    function printReceipt(order, companyOverride) {
        const model = buildInvoiceViewModel(order, companyOverride);
        const html = renderInvoiceHtml(model);
        return printHtmlViaHiddenFrame(html);
    }

    async function fetchOrderById(orderId, token) {
        const res = await global.fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const payload = await res.json();
        if (!res.ok) {
            throw new Error(payload?.message || 'Failed to load order for invoice.');
        }
        return payload.order || payload.data || payload;
    }

    async function printReceiptForOrderId(orderId, token) {
        const authToken = token || global.EOBStorage?.get(global.EOBStorageKeys?.TOKEN);
        if (!authToken || !orderId) return false;
        const order = await fetchOrderById(orderId, authToken);
        return printReceipt(order);
    }

    async function downloadPdf(options = {}) {
        const {
            orderId,
            displayOrderId,
            order,
            token,
            triggerBtn
        } = options;

        const authToken = token || global.EOBStorage?.get(global.EOBStorageKeys?.TOKEN);
        if (!authToken) {
            throw new Error('Login required');
        }
        const id = orderId || order?._id;
        if (!id) return false;

        let activeBtn = triggerBtn;
        const originalHtml = activeBtn?.innerHTML;
        if (activeBtn) {
            activeBtn.disabled = true;
            activeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading...';
        }

        try {
            const response = await global.fetch(`/api/orders/${encodeURIComponent(id)}/invoice`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${authToken}` }
            });

            if (!response.ok) {
                let message = 'Failed to download invoice PDF.';
                try {
                    const data = await response.json();
                    message = data.message || message;
                } catch (_) { /* ignore */ }
                throw new Error(message);
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="([^"]+)"/i);
            const filename = match?.[1] || `Invoice-${displayOrderId || resolveInvoiceNumber(order) || id}.pdf`;

            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            return true;
        } finally {
            if (activeBtn) {
                activeBtn.disabled = false;
                activeBtn.innerHTML = originalHtml;
            }
        }
    }

    const api = {
        DEFAULT_COMPANY,
        buildInvoiceViewModel,
        renderInvoiceHtml,
        extractOrderFinancials,
        resolveInvoiceNumber,
        resolvePaymentStamp,
        printReceipt,
        printReceiptForOrderId,
        downloadPdf,
        fetchOrderById
    };

    global.EOBInvoice = api;

    if (typeof global.downloadOrderInvoice === 'function') {
        global.downloadOrderInvoiceLegacy = global.downloadOrderInvoice;
    }

    global.downloadOrderInvoice = async (orderId, displayOrderId, triggerBtn) => {
        try {
            return await downloadPdf({ orderId, displayOrderId, triggerBtn });
        } catch (err) {
            if (typeof global.Swal !== 'undefined') {
                global.Swal.fire({ icon: 'error', title: 'Download Failed', text: err.message || 'Unable to download invoice.' });
            }
            return false;
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : global);
