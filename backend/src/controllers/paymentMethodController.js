/********************************************************************
 * Project: EonlineBazar
 * File: paymentMethodController.js
 * Location: controllers/paymentMethodController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin CRUD for the dynamic payment method catalog —
 * validation, Multer logo handling, display ordering, and write-only
 * handling of encrypted gateway credentials.
 ********************************************************************/

const PaymentMethod = require('../models/PaymentMethod');
const {
    PAYMENT_METHOD_TYPES,
    FEE_TYPES,
    GATEWAY_PROVIDERS
} = require('../models/PaymentMethod');
const {
    buildUniqueMethodCode,
    buildWebhookUrl,
    isCheckoutReady,
    clearPaymentMethodCache
} = require('../services/paymentMethodService');
const { paymentLogoPublicPath, deleteLocalPaymentLogo } = require('../utils/paymentLogoPaths');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');

const NAME_MAX = 60;
const INSTRUCTIONS_MAX = 2000;
const ACCOUNT_NUMBER_MAX = 80;
const DESCRIPTION_MAX = 160;

/** Multipart bodies deliver everything as strings — booleans included. */
function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const str = String(value).trim().toLowerCase();
    return str === 'true' || str === 'on' || str === '1' || str === 'yes';
}

function readString(value, max) {
    const str = String(value ?? '').trim();
    return max ? str.slice(0, max) : str;
}

function isObjectId(value) {
    return /^[0-9a-fA-F]{24}$/.test(String(value || ''));
}

/** Normalize multipart fields and optional logo upload from the request. */
function parsePaymentMethodRequest(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const file = req.file || null;
    const uploadedLogo = file?.filename ? paymentLogoPublicPath(file.filename) : '';
    return { body, file, uploadedLogo };
}

/**
 * Full validation of a create/update payload. Returns either `{ error }` or a
 * `{ value }` object holding only the fields the caller actually sent, so a
 * partial update never wipes untouched columns.
 */
function validatePaymentMethodPayload(body = {}, { isCreate = false, current = null } = {}) {
    const value = {};

    if (isCreate || body.name !== undefined) {
        const name = readString(body.name, NAME_MAX);
        if (!name) return { error: 'Payment method name is required.' };
        if (name.length < 2) return { error: 'Payment method name must be at least 2 characters.' };
        value.name = name;
    }

    const resolvedType = body.type !== undefined
        ? readString(body.type).toLowerCase()
        : (current?.type || 'manual');

    if (body.type !== undefined || isCreate) {
        if (!PAYMENT_METHOD_TYPES.includes(resolvedType)) {
            return { error: `Payment type must be one of: ${PAYMENT_METHOD_TYPES.join(', ')}.` };
        }
        value.type = resolvedType;
    }

    if (body.feeType !== undefined || isCreate) {
        const feeType = readString(body.feeType).toLowerCase() || 'percentage';
        if (!FEE_TYPES.includes(feeType)) {
            return { error: `Fee type must be one of: ${FEE_TYPES.join(', ')}.` };
        }
        value.feeType = feeType;
    }

    const resolvedFeeType = value.feeType || current?.feeType || 'percentage';

    if (body.processingFee !== undefined || isCreate) {
        const raw = body.processingFee === '' || body.processingFee === undefined ? 0 : Number(body.processingFee);
        if (!Number.isFinite(raw) || raw < 0) {
            return { error: 'Processing fee must be a number of 0 or more.' };
        }
        if (resolvedFeeType === 'percentage' && raw > 100) {
            return { error: 'A percentage processing fee cannot exceed 100.' };
        }
        value.processingFee = Math.round(raw * 100) / 100;
    }

    if (body.sortOrder !== undefined) {
        const raw = body.sortOrder === '' ? 0 : Number(body.sortOrder);
        if (!Number.isFinite(raw) || raw < 0 || raw > 9999) {
            return { error: 'Display order must be a number between 0 and 9999.' };
        }
        value.sortOrder = Math.trunc(raw);
    }

    if (body.isActive !== undefined) {
        value.isActive = parseBoolean(body.isActive, true);
    }

    if (body.description !== undefined) {
        value.description = readString(body.description, DESCRIPTION_MAX);
    }

    if (resolvedType === 'manual') {
        if (body.instructions !== undefined) {
            value.instructions = readString(body.instructions, INSTRUCTIONS_MAX);
        }
        if (body.accountNumber !== undefined) {
            value.accountNumber = readString(body.accountNumber, ACCOUNT_NUMBER_MAX);
        }
    } else {
        // Switching to an automated gateway retires the manual payout details.
        value.instructions = '';
        value.accountNumber = '';

        const provider = body.provider !== undefined
            ? readString(body.provider).toLowerCase()
            : (current?.provider || '');

        if (!provider) return { error: 'Select a gateway provider for automated payment methods.' };
        if (!GATEWAY_PROVIDERS.includes(provider)) {
            return { error: `Gateway provider must be one of: ${GATEWAY_PROVIDERS.join(', ')}.` };
        }
        value.provider = provider;

        const storeId = body.storeId !== undefined
            ? readString(body.storeId, 120)
            : (current?.apiConfig?.storeId || '');
        if (!storeId) return { error: 'Store ID is required for automated payment methods.' };

        value.apiConfig = {
            storeId,
            isSandbox: body.isSandbox !== undefined
                ? parseBoolean(body.isSandbox, true)
                : current?.apiConfig?.isSandbox !== false,
            webhookUrl: body.webhookUrl !== undefined
                ? readString(body.webhookUrl, 300)
                : (current?.apiConfig?.webhookUrl || '')
        };

        // Secrets are write-only: a blank field means "keep what is stored",
        // and an explicit clear flag is required to erase one.
        const storePassword = readString(body.storePassword, 400);
        if (storePassword) {
            value.apiConfig.storePassword = storePassword;
        } else if (parseBoolean(body.clearStorePassword)) {
            value.apiConfig.storePassword = '';
        } else {
            value.apiConfig.storePassword = current?.apiConfig?.storePassword || '';
        }

        const apiKey = readString(body.apiKey, 400);
        if (apiKey) {
            value.apiConfig.apiKey = apiKey;
        } else if (parseBoolean(body.clearApiKey)) {
            value.apiConfig.apiKey = '';
        } else {
            value.apiConfig.apiKey = current?.apiConfig?.apiKey || '';
        }

        if (!value.apiConfig.storePassword && !value.apiConfig.apiKey) {
            return { error: 'Provide a store password or an API key so the gateway can authenticate.' };
        }
    }

    return { value };
}

/** Admin card payload — masked secrets plus the derived checkout readiness flag. */
function toAdminPayload(doc, req) {
    const payload = doc.toAdminObject();
    payload.checkoutReady = isCheckoutReady(doc);
    payload.resolvedWebhookUrl = doc.type === 'automated'
        ? (payload.apiConfig.webhookUrl || buildWebhookUrl(doc.code, req))
        : '';
    return payload;
}

const listPaymentMethods = async (req, res) => {
    try {
        const methods = await PaymentMethod.find().sort({ sortOrder: 1, name: 1 });
        return res.status(200).json({
            success: true,
            data: methods.map((doc) => toAdminPayload(doc, req))
        });
    } catch (error) {
        console.error('List Payment Methods Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load payment methods.' });
    }
};

const getPaymentMethod = async (req, res) => {
    try {
        if (!isObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method id.' });
        }

        const method = await PaymentMethod.findById(req.params.id);
        if (!method) {
            return res.status(404).json({ success: false, message: 'Payment method not found.' });
        }

        return res.status(200).json({ success: true, data: toAdminPayload(method, req) });
    } catch (error) {
        console.error('Get Payment Method Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load payment method.' });
    }
};

const createPaymentMethod = async (req, res) => {
    let uploadedLogo = '';

    try {
        const { body, uploadedLogo: logoPath } = parsePaymentMethodRequest(req);
        uploadedLogo = logoPath;

        const parsed = validatePaymentMethodPayload(body, { isCreate: true });
        if (parsed.error) {
            if (uploadedLogo) deleteLocalPaymentLogo(uploadedLogo);
            return res.status(400).json({ success: false, message: parsed.error });
        }

        const duplicate = await PaymentMethod.findOne({
            name: new RegExp(`^${parsed.value.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        });
        if (duplicate) {
            if (uploadedLogo) deleteLocalPaymentLogo(uploadedLogo);
            return res.status(409).json({
                success: false,
                message: `"${parsed.value.name}" already exists. Edit that method instead.`
            });
        }

        const code = await buildUniqueMethodCode(parsed.value.name);

        // A new method lands at the end of the checkout list unless positioned.
        let sortOrder = parsed.value.sortOrder;
        if (sortOrder === undefined) {
            const last = await PaymentMethod.findOne().sort({ sortOrder: -1 }).select('sortOrder');
            sortOrder = (Number(last?.sortOrder) || 0) + 1;
        }

        const method = new PaymentMethod({
            ...parsed.value,
            code,
            sortOrder,
            logoUrl: uploadedLogo,
            createdByAdmin: req.admin?.username || 'admin',
            updatedByAdmin: req.admin?.username || 'admin'
        });

        if (method.type === 'automated' && !method.apiConfig.webhookUrl) {
            method.apiConfig.webhookUrl = buildWebhookUrl(code, req);
        }

        await method.save();
        clearPaymentMethodCache();

        const paymentMethod = toAdminPayload(method, req);

        await logSecurityEvent({
            action: 'Payment Method Created',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${method.name} (${method.code}) · ${method.type}${method.provider ? ` · ${method.provider}` : ''}`
        });

        return res.status(201).json({
            success: true,
            message: `${method.name} added to your payment methods.`,
            paymentMethod
        });
    } catch (err) {
        if (uploadedLogo) deleteLocalPaymentLogo(uploadedLogo);
        console.error('Payment Creation Error:', err);

        if (err.name === 'ValidationError') {
            const first = Object.values(err.errors)[0];
            return res.status(400).json({
                success: false,
                message: first?.message || err.message || 'Invalid payment method data.'
            });
        }

        const status = err.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
        return res.status(status).json({ success: false, message: err.message || 'Failed to create payment method.' });
    }
};

const updatePaymentMethod = async (req, res) => {
    let uploadedLogo = '';

    try {
        const { body, uploadedLogo: logoPath } = parsePaymentMethodRequest(req);
        uploadedLogo = logoPath;

        if (!isObjectId(req.params.id)) {
            if (uploadedLogo) deleteLocalPaymentLogo(uploadedLogo);
            return res.status(400).json({ success: false, message: 'Invalid payment method id.' });
        }

        const method = await PaymentMethod.findById(req.params.id);
        if (!method) {
            if (uploadedLogo) deleteLocalPaymentLogo(uploadedLogo);
            return res.status(404).json({ success: false, message: 'Payment method not found.' });
        }

        const parsed = validatePaymentMethodPayload(body, { current: method });
        if (parsed.error) {
            if (uploadedLogo) deleteLocalPaymentLogo(uploadedLogo);
            return res.status(400).json({ success: false, message: parsed.error });
        }

        if (parsed.value.name && parsed.value.name.toLowerCase() !== method.name.toLowerCase()) {
            const duplicate = await PaymentMethod.findOne({
                _id: { $ne: method._id },
                name: new RegExp(`^${parsed.value.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
            });
            if (duplicate) {
                if (uploadedLogo) deleteLocalPaymentLogo(uploadedLogo);
                return res.status(409).json({
                    success: false,
                    message: `Another payment method is already named "${parsed.value.name}".`
                });
            }
        }

        const { apiConfig, ...scalarFields } = parsed.value;
        Object.assign(method, scalarFields);

        if (apiConfig) {
            method.set('apiConfig.storeId', apiConfig.storeId);
            method.set('apiConfig.isSandbox', apiConfig.isSandbox);
            method.set('apiConfig.webhookUrl', apiConfig.webhookUrl || buildWebhookUrl(method.code, req));
            method.set('apiConfig.storePassword', apiConfig.storePassword);
            method.set('apiConfig.apiKey', apiConfig.apiKey);
        }

        if (uploadedLogo) {
            const previousLogo = method.logoUrl;
            method.logoUrl = uploadedLogo;
            if (previousLogo && previousLogo !== uploadedLogo) deleteLocalPaymentLogo(previousLogo);
        } else if (parseBoolean(body.removeLogo)) {
            if (method.logoUrl) deleteLocalPaymentLogo(method.logoUrl);
            method.logoUrl = '';
        }

        method.updatedByAdmin = req.admin?.username || 'admin';
        await method.save();
        clearPaymentMethodCache();

        const paymentMethod = toAdminPayload(method, req);

        await logSecurityEvent({
            action: 'Payment Method Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${method.name} (${method.code}) · ${method.isActive ? 'active' : 'disabled'}`
        });

        return res.status(200).json({
            success: true,
            message: `${method.name} updated successfully.`,
            paymentMethod
        });
    } catch (err) {
        if (uploadedLogo) deleteLocalPaymentLogo(uploadedLogo);
        console.error('Payment Update Error:', err);

        if (err.name === 'ValidationError') {
            const first = Object.values(err.errors)[0];
            return res.status(400).json({
                success: false,
                message: first?.message || err.message || 'Invalid payment method data.'
            });
        }

        const status = err.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
        return res.status(status).json({ success: false, message: err.message || 'Failed to update payment method.' });
    }
};

const togglePaymentMethod = async (req, res) => {
    try {
        if (!isObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method id.' });
        }

        const method = await PaymentMethod.findById(req.params.id);
        if (!method) {
            return res.status(404).json({ success: false, message: 'Payment method not found.' });
        }

        method.isActive = req.body?.isActive !== undefined
            ? parseBoolean(req.body.isActive, !method.isActive)
            : !method.isActive;
        method.updatedByAdmin = req.admin?.username || 'admin';
        await method.save();
        clearPaymentMethodCache();

        // Turning off the last usable method would leave checkout with nothing
        // to select, so the response carries a warning the panel surfaces.
        const remaining = await PaymentMethod.countDocuments({ isActive: true });

        await logSecurityEvent({
            action: 'Payment Method Toggled',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${method.name} (${method.code}) → ${method.isActive ? 'enabled' : 'disabled'}`
        });

        return res.status(200).json({
            success: true,
            message: `${method.name} is now ${method.isActive ? 'enabled' : 'disabled'}.`,
            warning: remaining === 0
                ? 'No payment methods are enabled — customers cannot complete checkout.'
                : '',
            data: toAdminPayload(method, req)
        });
    } catch (error) {
        console.error('Toggle Payment Method Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update payment method status.' });
    }
};

/** Bulk display-order save behind drag-and-drop and the order number inputs. */
const reorderPaymentMethods = async (req, res) => {
    try {
        const rawOrder = Array.isArray(req.body?.order) ? req.body.order : null;
        if (!rawOrder || rawOrder.length === 0) {
            return res.status(400).json({ success: false, message: 'Send an "order" array of payment methods.' });
        }

        const operations = [];
        for (const entry of rawOrder) {
            const id = entry?.id || entry?._id;
            if (!isObjectId(id)) {
                return res.status(400).json({ success: false, message: 'The order list contains an invalid payment method id.' });
            }

            const sortOrder = Number(entry?.sortOrder);
            if (!Number.isFinite(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
                return res.status(400).json({ success: false, message: 'Display order must be a number between 0 and 9999.' });
            }

            operations.push({
                updateOne: {
                    filter: { _id: id },
                    update: { $set: { sortOrder: Math.trunc(sortOrder) } }
                }
            });
        }

        await PaymentMethod.bulkWrite(operations);
        clearPaymentMethodCache();

        const methods = await PaymentMethod.find().sort({ sortOrder: 1, name: 1 });
        return res.status(200).json({
            success: true,
            message: 'Display order updated.',
            data: methods.map((doc) => toAdminPayload(doc, req))
        });
    } catch (error) {
        console.error('Reorder Payment Methods Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update display order.' });
    }
};

const deletePaymentMethod = async (req, res) => {
    try {
        if (!isObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method id.' });
        }

        const method = await PaymentMethod.findById(req.params.id);
        if (!method) {
            return res.status(404).json({ success: false, message: 'Payment method not found.' });
        }

        // Past orders keep their own denormalized payment snapshot, so deleting
        // a method never breaks historical reporting or the ledger.
        if (method.logoUrl) deleteLocalPaymentLogo(method.logoUrl);
        await method.deleteOne();
        clearPaymentMethodCache();

        await logSecurityEvent({
            action: 'Payment Method Deleted',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${method.name} (${method.code})`
        });

        return res.status(200).json({
            success: true,
            message: `${method.name} deleted. Existing orders keep their payment records.`,
            data: { id: String(method._id), code: method.code }
        });
    } catch (error) {
        console.error('Delete Payment Method Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete payment method.' });
    }
};

module.exports = {
    listPaymentMethods,
    getPaymentMethod,
    createPaymentMethod,
    updatePaymentMethod,
    togglePaymentMethod,
    reorderPaymentMethods,
    deletePaymentMethod,
    validatePaymentMethodPayload
};
