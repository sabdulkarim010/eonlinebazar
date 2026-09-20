/********************************************************************
 * Invoice PDF generation — wraps PDFKit helper + store branding.
 ********************************************************************/

const { fetchSettingsDocument } = require('./settingsReadService');
const { generateOrderInvoicePdf, resolveInvoiceNumber } = require('../utils/invoicePdf');

async function resolveBranding() {
    try {
        const settings = await fetchSettingsDocument();
        return {
            storeName: settings?.storeName || 'EOnlineBazar',
            logoUrl: settings?.logoPath || settings?.storeLogo || ''
        };
    } catch {
        return { storeName: 'EOnlineBazar', logoUrl: '' };
    }
}

/**
 * Generate invoice PDF buffer for an order document.
 * @param {object} order - Plain order object
 * @returns {Promise<{ buffer: Buffer, filename: string, invoiceNumber: string }>}
 */
async function generateInvoicePDF(order = {}) {
    const branding = await resolveBranding();
    const buffer = await generateOrderInvoicePdf(order, branding);
    const invoiceNumber = resolveInvoiceNumber(order);
    return {
        buffer,
        invoiceNumber,
        filename: `invoice-${invoiceNumber}.pdf`
    };
}

module.exports = {
    generateInvoicePDF,
    resolveInvoiceNumber
};
