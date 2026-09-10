/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: purchaseOrderController.js
 * Location: controllers/admin/purchaseOrderController.js
 * Author: Abdul Karim Sheikh
 * Description: Purchase order lifecycle — draft → sent → partial →
 * received, plus cancellation. Receiving is the only path that mutates
 * inventory: accepted quantities are added to Product.stockQuantity and
 * the unit cost is appended to the product's costHistory.
 ********************************************************************/

const mongoose = require('mongoose');
const PurchaseOrder = require('../../models/purchaseOrder');
const Supplier = require('../../models/supplier');
const Warehouse = require('../../models/warehouse');
const Product = require('../../models/product');
const { getDefaultWarehouseId } = require('../../services/warehouseService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

/** A PO may only be edited while nothing has been received against it. */
const EDITABLE_STATUSES = ['draft', 'sent'];

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function toDateOrNull(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Validate and normalize the item lines of a PO request. Every line must
 * reference a real product; the product name is snapshotted so a later
 * deletion does not blank out the PO.
 */
async function normalizePoItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return { error: 'A purchase order needs at least one item line.' };
    }

    const ids = rawItems
        .map((item) => String(item?.productId || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (ids.length !== rawItems.length) {
        return { error: 'Every item line needs a valid productId.' };
    }

    const products = await Product.find({ _id: { $in: ids } })
        .select('_id name productId')
        .lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const items = [];

    for (const raw of rawItems) {
        const product = productMap.get(String(raw.productId));
        if (!product) {
            return { error: `Product ${raw.productId} no longer exists.` };
        }

        const qty = Number(raw.qty);
        const unitCost = Number(raw.unitCost);

        if (!Number.isFinite(qty) || qty <= 0) {
            return { error: `Quantity for "${product.name}" must be greater than zero.` };
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
            return { error: `Unit cost for "${product.name}" must be zero or more.` };
        }

        items.push({
            productId: product._id,
            productName: product.name || '',
            qty,
            unitCost,
            receivedQty: 0
        });
    }

    return { items };
}

/** Resolve the destination warehouse, falling back to the store default. */
async function resolveWarehouseId(rawId) {
    const id = String(rawId || '').trim();

    if (id && mongoose.Types.ObjectId.isValid(id)) {
        const exists = await Warehouse.exists({ _id: id });
        if (exists) return id;
    }

    return getDefaultWarehouseId();
}

/**
 * GET /api/admin/purchase-orders
 * Paginated PO ledger. Supports ?status= and ?supplierId= filters.
 */
exports.getAllPOs = async (req, res) => {
    try {
        const filter = {};

        const status = String(req.query.status || '').trim().toLowerCase();
        if (status && PurchaseOrder.STATUSES.includes(status)) {
            filter.status = status;
        }

        const supplierId = String(req.query.supplierId || '').trim();
        if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
            filter.supplierId = supplierId;
        }

        const { page, limit, skip } = parsePagination(req.query);

        const [orders, total] = await Promise.all([
            PurchaseOrder.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('supplierId', 'name contactPerson phone')
                .populate('warehouseId', 'name location')
                .lean(),
            PurchaseOrder.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: orders,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('getAllPOs Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load purchase orders.' });
    }
};

/** GET /api/admin/purchase-orders/:id */
exports.getPOById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid purchase order id.' });
        }

        const order = await PurchaseOrder.findById(id)
            .populate('supplierId', 'name contactPerson phone email address')
            .populate('warehouseId', 'name location address')
            .populate('items.productId', 'name productId stockQuantity')
            .lean();

        if (!order) {
            return res.status(404).json({ success: false, message: 'Purchase order not found.' });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        console.error('getPOById Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load purchase order.' });
    }
};

/**
 * POST /api/admin/purchase-orders
 * Raise a new PO against a supplier. poNumber is generated server-side;
 * a duplicate (two admins saving in the same instant) is retried.
 */
exports.createPO = async (req, res) => {
    try {
        const body = req.body || {};

        const supplierId = String(body.supplierId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            return res.status(400).json({ success: false, message: 'A valid supplierId is required.' });
        }

        const supplier = await Supplier.findById(supplierId).select('name').lean();
        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Supplier not found.' });
        }

        const { items, error } = await normalizePoItems(body.items);
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const requestedStatus = String(body.status || 'draft').trim().toLowerCase();
        const status = EDITABLE_STATUSES.includes(requestedStatus) ? requestedStatus : 'draft';

        const payload = {
            supplierId,
            warehouseId: await resolveWarehouseId(body.warehouseId),
            items,
            status,
            expectedDate: toDateOrNull(body.expectedDate),
            notes: String(body.notes || '').trim(),
            createdBy: req.adminId || null,
            createdByName: req.admin?.username || ''
        };

        // poNumber is unique; retry once if a concurrent create took ours.
        let purchaseOrder = null;
        for (let attempt = 0; attempt < 3 && !purchaseOrder; attempt += 1) {
            try {
                purchaseOrder = await PurchaseOrder.create({
                    ...payload,
                    poNumber: await PurchaseOrder.generatePoNumber()
                });
            } catch (err) {
                if (err?.code !== 11000 || attempt === 2) throw err;
            }
        }

        await logSecurityEvent({
            action: 'Purchase Order Created',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${purchaseOrder.poNumber} — ${supplier.name} (৳${purchaseOrder.totalCost})`,
            resourceType: 'purchase_order',
            resourceId: String(purchaseOrder._id)
        });

        res.status(201).json({
            success: true,
            message: `Purchase order ${purchaseOrder.poNumber} created.`,
            data: purchaseOrder
        });
    } catch (error) {
        console.error('createPO Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create purchase order.' });
    }
};

/**
 * PUT /api/admin/purchase-orders/:id
 * Editable only while draft or sent — once goods arrive the lines are
 * locked so received quantities can never be orphaned.
 */
exports.updatePO = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid purchase order id.' });
        }

        const purchaseOrder = await PurchaseOrder.findById(id);
        if (!purchaseOrder) {
            return res.status(404).json({ success: false, message: 'Purchase order not found.' });
        }

        if (!EDITABLE_STATUSES.includes(purchaseOrder.status)) {
            return res.status(409).json({
                success: false,
                message: `A "${purchaseOrder.status}" purchase order can no longer be edited.`
            });
        }

        const body = req.body || {};

        if (body.supplierId !== undefined) {
            const supplierId = String(body.supplierId).trim();
            if (!mongoose.Types.ObjectId.isValid(supplierId) || !(await Supplier.exists({ _id: supplierId }))) {
                return res.status(400).json({ success: false, message: 'A valid supplierId is required.' });
            }
            purchaseOrder.supplierId = supplierId;
        }

        if (body.items !== undefined) {
            const { items, error } = await normalizePoItems(body.items);
            if (error) {
                return res.status(400).json({ success: false, message: error });
            }
            purchaseOrder.items = items;
        }

        if (body.warehouseId !== undefined) {
            purchaseOrder.warehouseId = await resolveWarehouseId(body.warehouseId);
        }
        if (body.expectedDate !== undefined) {
            purchaseOrder.expectedDate = toDateOrNull(body.expectedDate);
        }
        if (body.notes !== undefined) {
            purchaseOrder.notes = String(body.notes).trim();
        }

        if (body.status !== undefined) {
            const nextStatus = String(body.status).trim().toLowerCase();
            if (!EDITABLE_STATUSES.includes(nextStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'Status may only be set to "draft" or "sent" here. Use receive or cancel for the rest.'
                });
            }
            purchaseOrder.status = nextStatus;
        }

        await purchaseOrder.save();

        await logSecurityEvent({
            action: 'Purchase Order Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${purchaseOrder.poNumber} (৳${purchaseOrder.totalCost})`,
            resourceType: 'purchase_order',
            resourceId: String(purchaseOrder._id)
        });

        res.status(200).json({
            success: true,
            message: `Purchase order ${purchaseOrder.poNumber} updated.`,
            data: purchaseOrder
        });
    } catch (error) {
        console.error('updatePO Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update purchase order.' });
    }
};

/**
 * POST /api/admin/purchase-orders/:id/receive
 * Book a delivery against the PO.
 *
 * Body: { items: [{ itemId, receivedQty }] } where receivedQty is the
 * quantity arriving in THIS delivery. Omit `items` to receive everything
 * still outstanding. Stock rises by the accepted quantity and the unit
 * cost is appended to Product.costHistory.
 */
exports.receivePO = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid purchase order id.' });
        }

        const purchaseOrder = await PurchaseOrder.findById(id);
        if (!purchaseOrder) {
            return res.status(404).json({ success: false, message: 'Purchase order not found.' });
        }

        if (purchaseOrder.status === 'cancelled') {
            return res.status(409).json({ success: false, message: 'A cancelled purchase order cannot receive stock.' });
        }
        if (purchaseOrder.status === 'received') {
            return res.status(409).json({ success: false, message: 'This purchase order is already fully received.' });
        }

        // Map the requested deltas by line id; absent means "receive the rest".
        const requested = new Map();
        if (Array.isArray(req.body?.items)) {
            for (const raw of req.body.items) {
                const itemId = String(raw?.itemId || raw?._id || '').trim();
                const qty = Number(raw?.receivedQty);
                if (!itemId) {
                    return res.status(400).json({ success: false, message: 'Every receive line needs an itemId.' });
                }
                if (!Number.isFinite(qty) || qty < 0) {
                    return res.status(400).json({ success: false, message: 'receivedQty must be zero or more.' });
                }
                requested.set(itemId, qty);
            }
        }

        const deltas = [];

        for (const item of purchaseOrder.items) {
            const outstanding = (Number(item.qty) || 0) - (Number(item.receivedQty) || 0);
            const delta = requested.size > 0
                ? (requested.get(String(item._id)) || 0)
                : outstanding;

            if (delta <= 0) continue;

            if (delta > outstanding) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot receive ${delta} of "${item.productName}" — only ${outstanding} still outstanding.`
                });
            }

            deltas.push({ item, delta });
        }

        if (!deltas.length) {
            return res.status(400).json({ success: false, message: 'Nothing to receive on this purchase order.' });
        }

        const warnings = [];

        for (const { item, delta } of deltas) {
            const product = await Product.findById(item.productId);

            if (!product) {
                warnings.push(`Product for "${item.productName}" no longer exists — stock not updated.`);
            } else if (product.hasVariants) {
                // Variant stock is the sum of the matrix rows, so we cannot
                // attribute an incoming carton to a specific SKU here.
                warnings.push(`"${product.name}" uses variants — allocate the ${delta} received unit(s) to a variant manually.`);
                product.costHistory.push({
                    cost: item.unitCost,
                    date: new Date(),
                    supplierId: purchaseOrder.supplierId
                });
                await product.save();
            } else {
                const nextStock = (Number(product.stockQuantity) || 0) + delta;
                product.stockQuantity = nextStock;
                product.stock = nextStock;
                product.costHistory.push({
                    cost: item.unitCost,
                    date: new Date(),
                    supplierId: purchaseOrder.supplierId
                });
                await product.save();
            }

            item.receivedQty = (Number(item.receivedQty) || 0) + delta;
        }

        purchaseOrder.status = purchaseOrder.deriveReceivingStatus();
        if (purchaseOrder.status === 'received') {
            purchaseOrder.receivedDate = toDateOrNull(req.body?.receivedDate) || new Date();
        }

        await purchaseOrder.save();

        const receivedUnits = deltas.reduce((sum, d) => sum + d.delta, 0);

        await logSecurityEvent({
            action: 'Purchase Order Received',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${purchaseOrder.poNumber} — ${receivedUnits} unit(s) received, status ${purchaseOrder.status}`,
            resourceType: 'purchase_order',
            resourceId: String(purchaseOrder._id)
        });

        res.status(200).json({
            success: true,
            message: `Received ${receivedUnits} unit(s) against ${purchaseOrder.poNumber}.`,
            data: purchaseOrder,
            warnings
        });
    } catch (error) {
        console.error('receivePO Error:', error);
        res.status(500).json({ success: false, message: 'Failed to receive purchase order.' });
    }
};

/**
 * POST /api/admin/purchase-orders/:id/cancel
 * Only possible while no goods have been booked in — cancelling after a
 * partial receipt would strand stock that is already on the shelf.
 */
exports.cancelPO = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid purchase order id.' });
        }

        const purchaseOrder = await PurchaseOrder.findById(id);
        if (!purchaseOrder) {
            return res.status(404).json({ success: false, message: 'Purchase order not found.' });
        }

        if (purchaseOrder.status === 'cancelled') {
            return res.status(409).json({ success: false, message: 'This purchase order is already cancelled.' });
        }

        const receivedUnits = (purchaseOrder.items || [])
            .reduce((sum, item) => sum + (Number(item.receivedQty) || 0), 0);

        if (receivedUnits > 0) {
            return res.status(409).json({
                success: false,
                message: `Cannot cancel ${purchaseOrder.poNumber} — ${receivedUnits} unit(s) already received into stock.`
            });
        }

        purchaseOrder.status = 'cancelled';
        const reason = String(req.body?.reason || '').trim();
        if (reason) {
            purchaseOrder.notes = purchaseOrder.notes
                ? `${purchaseOrder.notes}\nCancelled: ${reason}`
                : `Cancelled: ${reason}`;
        }

        await purchaseOrder.save();

        await logSecurityEvent({
            action: 'Purchase Order Cancelled',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${purchaseOrder.poNumber}${reason ? ` — ${reason}` : ''}`,
            resourceType: 'purchase_order',
            resourceId: String(purchaseOrder._id)
        });

        res.status(200).json({
            success: true,
            message: `Purchase order ${purchaseOrder.poNumber} cancelled.`,
            data: purchaseOrder
        });
    } catch (error) {
        console.error('cancelPO Error:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel purchase order.' });
    }
};

// Names used by the routes registered before the workflow landed.
exports.getAllPurchaseOrders = exports.getAllPOs;
exports.getPurchaseOrderById = exports.getPOById;
