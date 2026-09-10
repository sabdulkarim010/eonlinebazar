/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: supplierController.js
 * Location: controllers/admin/supplierController.js
 * Author: Abdul Karim Sheikh
 * Description: Vendor/supplier CRUD for the ERP module. Deleting a
 * supplier is refused while an open purchase order still references it,
 * so the PO ledger can never point at a missing vendor.
 ********************************************************************/

const mongoose = require('mongoose');
const Supplier = require('../../models/supplier');
const Product = require('../../models/product');
const PurchaseOrder = require('../../models/purchaseOrder');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

/** Purchase orders in these states still expect goods from the vendor. */
const OPEN_PO_STATUSES = ['draft', 'sent', 'partial'];

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Keep only the ObjectIds that point at products that actually exist. */
async function resolveSuppliedProducts(input) {
    if (!Array.isArray(input)) return undefined;

    const ids = input
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (!ids.length) return [];

    const found = await Product.find({ _id: { $in: ids } }).select('_id').lean();
    return found.map((doc) => doc._id);
}

/**
 * Build the writable field set from a request body. Only keys present on the
 * body are returned, so PATCH-style partial updates leave the rest untouched.
 */
function pickSupplierFields(body) {
    const fields = {};

    if (body.name !== undefined) fields.name = String(body.name).trim();
    if (body.contactPerson !== undefined) fields.contactPerson = String(body.contactPerson).trim();
    if (body.phone !== undefined) fields.phone = String(body.phone).trim();
    if (body.email !== undefined) fields.email = String(body.email).trim().toLowerCase();
    if (body.address !== undefined) fields.address = String(body.address).trim();
    if (body.notes !== undefined) fields.notes = String(body.notes).trim();
    if (body.status !== undefined) {
        const status = String(body.status).trim().toLowerCase();
        if (status === 'active' || status === 'inactive') fields.status = status;
    }

    return fields;
}

/**
 * GET /api/admin/suppliers
 * Paginated vendor directory. Supports ?search= (name/contact/phone/email),
 * ?status=active|inactive, and ?all=true for dropdown population.
 */
exports.getAllSuppliers = async (req, res) => {
    try {
        const filter = {};

        const status = String(req.query.status || '').trim().toLowerCase();
        if (status === 'active' || status === 'inactive') {
            filter.status = status;
        }

        const search = String(req.query.search || '').trim();
        if (search) {
            const re = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ name: re }, { contactPerson: re }, { phone: re }, { email: re }];
        }

        // Dropdowns need the whole active list, not a page of it.
        if (String(req.query.all || '').toLowerCase() === 'true') {
            const suppliers = await Supplier.find(filter).sort({ name: 1 }).lean();
            return res.status(200).json({
                success: true,
                data: suppliers,
                pagination: { page: 1, limit: suppliers.length, total: suppliers.length, totalPages: 1 }
            });
        }

        const { page, limit, skip } = parsePagination(req.query);

        const [suppliers, total] = await Promise.all([
            Supplier.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('suppliedProducts', 'name productId')
                .lean(),
            Supplier.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: suppliers,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('getAllSuppliers Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load suppliers.' });
    }
};

/**
 * GET /api/admin/suppliers/:id
 * Single vendor with its product roster and recent purchase orders.
 */
exports.getSupplierById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid supplier id.' });
        }

        const supplier = await Supplier.findById(id)
            .populate('suppliedProducts', 'name productId price stockQuantity')
            .lean();

        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Supplier not found.' });
        }

        const purchaseOrders = await PurchaseOrder.find({ supplierId: id })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('poNumber status totalCost expectedDate receivedDate createdAt')
            .lean();

        res.status(200).json({ success: true, data: { ...supplier, purchaseOrders } });
    } catch (error) {
        console.error('getSupplierById Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load supplier.' });
    }
};

/**
 * POST /api/admin/suppliers
 * Create a vendor. Name is the only required field.
 */
exports.createSupplier = async (req, res) => {
    try {
        const fields = pickSupplierFields(req.body || {});

        if (!fields.name) {
            return res.status(400).json({ success: false, message: 'Supplier name is required.' });
        }

        const suppliedProducts = await resolveSuppliedProducts(req.body?.suppliedProducts);
        if (suppliedProducts !== undefined) fields.suppliedProducts = suppliedProducts;

        fields.createdBy = req.adminId || null;

        const supplier = await Supplier.create(fields);

        await logSecurityEvent({
            action: 'Supplier Created',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: supplier.name,
            resourceType: 'supplier',
            resourceId: String(supplier._id)
        });

        res.status(201).json({ success: true, message: 'Supplier created.', data: supplier });
    } catch (error) {
        console.error('createSupplier Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create supplier.' });
    }
};

/**
 * PUT /api/admin/suppliers/:id
 * Partial update — only the fields present on the body are written.
 */
exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid supplier id.' });
        }

        const fields = pickSupplierFields(req.body || {});

        if (fields.name !== undefined && !fields.name) {
            return res.status(400).json({ success: false, message: 'Supplier name cannot be empty.' });
        }

        const suppliedProducts = await resolveSuppliedProducts(req.body?.suppliedProducts);
        if (suppliedProducts !== undefined) fields.suppliedProducts = suppliedProducts;

        if (!Object.keys(fields).length) {
            return res.status(400).json({ success: false, message: 'No changes supplied.' });
        }

        const supplier = await Supplier.findByIdAndUpdate(
            id,
            { $set: fields },
            { new: true, runValidators: true }
        );

        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Supplier not found.' });
        }

        await logSecurityEvent({
            action: 'Supplier Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: supplier.name,
            resourceType: 'supplier',
            resourceId: String(supplier._id)
        });

        res.status(200).json({ success: true, message: 'Supplier updated.', data: supplier });
    } catch (error) {
        console.error('updateSupplier Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update supplier.' });
    }
};

/**
 * DELETE /api/admin/suppliers/:id
 * Refused while an open PO references the vendor. On success, any product
 * pointing at this supplier is unlinked so no dangling reference is left.
 */
exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid supplier id.' });
        }

        const supplier = await Supplier.findById(id);
        if (!supplier) {
            return res.status(404).json({ success: false, message: 'Supplier not found.' });
        }

        const openPoCount = await PurchaseOrder.countDocuments({
            supplierId: id,
            status: { $in: OPEN_PO_STATUSES }
        });

        if (openPoCount > 0) {
            return res.status(409).json({
                success: false,
                message: `Cannot delete "${supplier.name}" — ${openPoCount} open purchase order(s) still reference it. Receive or cancel them first.`
            });
        }

        await Product.updateMany({ supplierId: id }, { $set: { supplierId: null } });
        await Supplier.findByIdAndDelete(id);

        await logSecurityEvent({
            action: 'Supplier Deleted',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: supplier.name,
            resourceType: 'supplier',
            resourceId: String(supplier._id)
        });

        res.status(200).json({ success: true, message: 'Supplier deleted.' });
    } catch (error) {
        console.error('deleteSupplier Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete supplier.' });
    }
};
