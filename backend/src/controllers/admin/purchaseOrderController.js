/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: purchaseOrderController.js
 * Description: Purchase order list and summary for the admin ERP module.
 ********************************************************************/

const mongoose = require('mongoose');
const PurchaseOrder = require('../../models/purchaseOrder');

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

/**
 * GET /api/admin/purchase-orders
 */
exports.getAllPurchaseOrders = async (req, res) => {
    try {
        const filter = {};
        const status = String(req.query.status || '').trim().toLowerCase();
        if (status && PurchaseOrder.STATUSES.includes(status)) {
            filter.status = status;
        }

        const { page, limit, skip } = parsePagination(req.query);

        const [orders, total] = await Promise.all([
            PurchaseOrder.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('supplierId', 'name contactPerson phone')
                .populate('warehouseId', 'name code')
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
        console.error('getAllPurchaseOrders Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load purchase orders.' });
    }
};

/**
 * GET /api/admin/purchase-orders/:id
 */
exports.getPurchaseOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid purchase order id.' });
        }

        const order = await PurchaseOrder.findById(id)
            .populate('supplierId', 'name contactPerson phone email address')
            .populate('warehouseId', 'name code address')
            .populate('items.productId', 'name productId stockQuantity')
            .lean();

        if (!order) {
            return res.status(404).json({ success: false, message: 'Purchase order not found.' });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        console.error('getPurchaseOrderById Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load purchase order.' });
    }
};
