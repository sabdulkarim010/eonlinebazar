/********************************************************************
 * Project: EonlineBazar
 * File: stockAlertService.js
 * Location: utils/stockAlertService.js
 * Description: Background cron job — checks stock levels and alerts
 * admin via email, SMS, and WhatsApp when products fall below threshold.
 ********************************************************************/

const cron = require('node-cron');
const Product = require('../models/product');
const StockAlert = require('../models/stockAlert');
const Settings = require('../models/Settings');
const { sendStockAlertEmail } = require('./mailer');
const { sendSms } = require('./smsService');
const { sendAdminCustomAlert, isGatewayConfigured, loadWhatsAppAlertGatewayConfig } = require('./whatsappService');
const { emitToAdmins } = require('./socketService');

const DEFAULT_THRESHOLD = Number(process.env.LOW_STOCK_DEFAULT_THRESHOLD) || 10;
const DEFAULT_CRON = '0 * * * *';
const PRODUCT_FIELDS = 'name productId stockQuantity lowStockThreshold category stock';

/** Products that are not inactive or deleted (field may not exist on older docs). */
const ACTIVE_PRODUCT_FILTER = {
    $or: [
        { status: { $exists: false } },
        { status: { $nin: ['inactive', 'deleted'] } }
    ]
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function mapLowStockProduct(doc) {
    const stock = Number(doc.stockQuantity ?? doc.stock) || 0;
    const threshold = Number(doc.lowStockThreshold) || DEFAULT_THRESHOLD;
    return {
        name: doc.name || 'Unnamed',
        productId: doc.productId || String(doc._id),
        stockQuantity: stock,
        lowStockThreshold: threshold,
        category: doc.category || 'General',
        stock,
        threshold
    };
}

function mapOutOfStockProduct(doc) {
    return {
        name: doc.name || 'Unnamed',
        productId: doc.productId || String(doc._id),
        stockQuantity: 0,
        lowStockThreshold: Number(doc.lowStockThreshold) || DEFAULT_THRESHOLD,
        category: doc.category || 'General'
    };
}

function buildStockAlertHtml({ lowStock, outOfStock, checkedAt }) {
    const formatRow = (p, isOutOfStock) => {
        const bg = isOutOfStock ? 'background:#fef2f2;color:#991b1b;' : '';
        const stock = isOutOfStock ? 0 : (p.stockQuantity ?? p.stock ?? 0);
        const threshold = p.lowStockThreshold ?? p.threshold ?? DEFAULT_THRESHOLD;
        return `
            <tr style="${bg}">
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(p.name)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(p.productId)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(p.category || '—')}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600;">${stock}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${threshold}</td>
            </tr>
        `;
    };

    const rows = [
        ...lowStock.map((p) => formatRow(p, false)),
        ...outOfStock.map((p) => formatRow(p, true))
    ].join('');

    const checkedLabel = checkedAt instanceof Date
        ? checkedAt.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })
        : String(checkedAt);

    return `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="background:#0f172a;padding:22px;text-align:center;">
                <h2 style="color:#f8fafc;margin:0;">⚠️ EOnlineBazar Stock Alert</h2>
                <p style="color:#94a3b8;margin:8px 0 0;font-size:13px;">Checked at ${escapeHtml(checkedLabel)}</p>
            </div>
            <div style="padding:24px;">
                <p style="color:#374151;margin:0 0 16px;">
                    <b>${lowStock.length}</b> product(s) are low on stock and
                    <b style="color:#dc2626;">${outOfStock.length}</b> product(s) are out of stock.
                </p>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="padding:10px 12px;text-align:left;">Product Name</th>
                            <th style="padding:10px 12px;text-align:left;">SKU/ID</th>
                            <th style="padding:10px 12px;text-align:left;">Category</th>
                            <th style="padding:10px 12px;text-align:center;">Current Stock</th>
                            <th style="padding:10px 12px;text-align:center;">Threshold</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td colspan="5" style="padding:12px;color:#64748b;">No alerts</td></tr>'}
                    </tbody>
                </table>
                <p style="color:#64748b;font-size:12px;margin-top:20px;">Out-of-stock rows are highlighted in red. Restock via the admin panel.</p>
            </div>
        </div>
    `;
}

function buildWhatsAppMessage({ lowStock, outOfStock }) {
    const lines = [
        '⚠️ *EOnlineBazar Stock Alert*',
        '',
        `• Low stock: ${lowStock.length}`,
        `• Out of stock: ${outOfStock.length}`,
        ''
    ];

    if (outOfStock.length > 0) {
        lines.push('*Out of stock:*');
        outOfStock.slice(0, 15).forEach((p) => {
            lines.push(`  - ${p.name} (${p.productId})`);
        });
        if (outOfStock.length > 15) {
            lines.push(`  … and ${outOfStock.length - 15} more`);
        }
        lines.push('');
    }

    if (lowStock.length > 0) {
        lines.push('*Low stock:*');
        lowStock.slice(0, 10).forEach((p) => {
            const stock = p.stockQuantity ?? p.stock ?? 0;
            lines.push(`  - ${p.name}: ${stock} left (threshold ${p.lowStockThreshold ?? p.threshold ?? DEFAULT_THRESHOLD})`);
        });
        if (lowStock.length > 10) {
            lines.push(`  … and ${lowStock.length - 10} more`);
        }
    }

    return lines.join('\n');
}

async function resolveAdminSmsPhone() {
    try {
        const settings = await Settings.getOrCreate();
        const fromSettings = String(settings.privateAdminAlertWhatsApp || '').replace(/\D/g, '');
        if (fromSettings) return fromSettings;
    } catch (err) {
        console.warn('[StockAlert] Could not load admin phone from Settings:', err.message);
    }
    return String(process.env.ADMIN_ALERT_PHONE || process.env.ADMIN_PHONE || '').replace(/\D/g, '');
}

async function isWhatsAppConfigured() {
    try {
        const gatewayConfig = await loadWhatsAppAlertGatewayConfig();
        return isGatewayConfigured(gatewayConfig);
    } catch {
        return false;
    }
}

/**
 * Query low/out-of-stock products and send alerts. Returns the alert payload.
 */
async function checkAndAlertLowStock() {
    const defaultThreshold = DEFAULT_THRESHOLD;

    const lowStockDocs = await Product.find({
        ...ACTIVE_PRODUCT_FILTER,
        $expr: {
            $and: [
                { $gt: [{ $ifNull: ['$stockQuantity', '$stock'] }, 0] },
                {
                    $lte: [
                        { $ifNull: ['$stockQuantity', '$stock'] },
                        { $ifNull: ['$lowStockThreshold', defaultThreshold] }
                    ]
                }
            ]
        }
    }).select(PRODUCT_FIELDS).lean();

    const outOfStockDocs = await Product.find({
        ...ACTIVE_PRODUCT_FILTER,
        $or: [
            { stockQuantity: 0 },
            { stockQuantity: { $exists: false }, stock: 0 }
        ]
    }).select(PRODUCT_FIELDS).lean();

    const lowStock = lowStockDocs.map(mapLowStockProduct);
    const outOfStock = outOfStockDocs.map(mapOutOfStockProduct);

    if (lowStock.length === 0 && outOfStock.length === 0) {
        console.log('Stock check: all products adequately stocked');
        return {
            checkedAt: new Date(),
            lowStock: [],
            outOfStock: [],
            alertsSent: { email: false, sms: false, whatsapp: false }
        };
    }

    const checkedAt = new Date();
    const payload = { checkedAt, lowStock, outOfStock };
    const alertsSent = { email: false, sms: false, whatsapp: false };

    const adminEmail = String(process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
    const subject = `⚠️ EOnlineBazar Stock Alert — ${lowStock.length} Low, ${outOfStock.length} Out of Stock`;
    const html = buildStockAlertHtml(payload);

    const emailResult = await sendStockAlertEmail({ to: adminEmail, subject, html });
    alertsSent.email = emailResult.delivered === true;

    if (outOfStock.length > 0) {
        const adminPhone = await resolveAdminSmsPhone();
        const smsBody = `EOnlineBazar Alert: ${outOfStock.length} products are OUT OF STOCK. Check admin panel.`;
        const smsResult = await sendSms({
            to: adminPhone,
            body: smsBody,
            context: 'STOCK ALERT'
        });
        alertsSent.sms = smsResult.delivered === true;

        outOfStock.forEach((product) => {
            emitToAdmins('low_stock_alert', {
                productName: product.name,
                stockQuantity: product.stockQuantity,
                threshold: product.lowStockThreshold
            });
        });
    }

    if (await isWhatsAppConfigured()) {
        const waBody = buildWhatsAppMessage(payload);
        const waResult = await sendAdminCustomAlert(waBody);
        alertsSent.whatsapp = waResult.delivered === true;
    }

    try {
        await StockAlert.create({
            checkedAt,
            lowStockCount: lowStock.length,
            outOfStockCount: outOfStock.length,
            lowStockProducts: lowStock.map((p) => ({
                name: p.name,
                productId: p.productId,
                stock: p.stockQuantity ?? p.stock ?? 0,
                threshold: p.lowStockThreshold ?? p.threshold ?? defaultThreshold
            })),
            outOfStockProducts: outOfStock.map((p) => ({
                name: p.name,
                productId: p.productId
            })),
            alertsSent
        });
    } catch (err) {
        console.error('[StockAlert] Failed to save alert log:', err.message);
    }

    console.log(`[StockAlert] Completed — ${lowStock.length} low, ${outOfStock.length} out of stock`);
    return { ...payload, alertsSent };
}

let cronTask = null;

/**
 * Schedule the stock alert cron job when LOW_STOCK_ALERT_ENABLED=true.
 */
function startStockAlertCron() {
    if (process.env.LOW_STOCK_ALERT_ENABLED !== 'true') {
        console.log('[StockAlert] Cron disabled (LOW_STOCK_ALERT_ENABLED !== true)');
        return;
    }

    const schedule = String(process.env.LOW_STOCK_CHECK_INTERVAL || DEFAULT_CRON).trim() || DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.error(`[StockAlert] Invalid cron expression "${schedule}" — using default ${DEFAULT_CRON}`);
    }

    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (cronTask) {
        cronTask.stop();
    }

    cronTask = cron.schedule(expression, () => {
        checkAndAlertLowStock().catch((err) => {
            console.error('[StockAlert] Cron job error:', err.message);
        });
    });

    console.log(`[StockAlert] Cron scheduled: "${expression}"`);
}

module.exports = {
    startStockAlertCron,
    checkAndAlertLowStock
};
