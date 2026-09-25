/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: warehouseController.js
 * Location: controllers/admin/warehouseController.js
 * Author: Abdul Karim Sheikh
 * Description: Stock location CRUD. Exactly one warehouse carries the
 * isDefault flag; promoting a new default demotes the previous one in the
 * same request, and the default location cannot be deleted.
 ********************************************************************/

const mongoose = require('mongoose');
const Warehouse = require('../../models/warehouse');
const Product = require('../../models/product');
const PurchaseOrder = require('../../models/purchaseOrder');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');
const { dualWrite } = require('../../services/dualWriteService');
const { routedRead } = require('../../services/readRouter');
const {
    mapWarehousesToMongo,
    warehouseToMongoShape
} = require('../../services/readShapeHelpers');

/** Lazy load — avoids pulling Prisma into Jest when the app graph is imported. */
function getWarehouseRepository() {
    return require('../../repositories/warehouseRepository');
}

function mapMongoWarehouseToPostgresCreate(mongoWarehouse) {
    return {
        name: mongoWarehouse.name,
        location: mongoWarehouse.location,
        address: mongoWarehouse.address,
        managerName: mongoWarehouse.managerName,
        phone: mongoWarehouse.phone,
        status: mongoWarehouse.status,
        isDefault: mongoWarehouse.isDefault,
        createdById: mongoWarehouse.createdBy || null,
        legacyId: String(mongoWarehouse._id),
        locationHierarchy: mongoWarehouse.locationHierarchy || []
    };
}

function mapMongoWarehouseFieldsToPostgresUpdate(mongoWarehouse, mongoFields) {
    const payload = {};
    if (mongoFields.name !== undefined) payload.name = mongoWarehouse.name;
    if (mongoFields.location !== undefined) payload.location = mongoWarehouse.location;
    if (mongoFields.address !== undefined) payload.address = mongoWarehouse.address;
    if (mongoFields.managerName !== undefined) payload.managerName = mongoWarehouse.managerName;
    if (mongoFields.phone !== undefined) payload.phone = mongoWarehouse.phone;
    if (mongoFields.status !== undefined) payload.status = mongoWarehouse.status;
    if (mongoFields.isDefault === true) payload.isDefault = true;
    if (mongoFields.locationHierarchy !== undefined) {
        payload.locationHierarchy = mongoWarehouse.locationHierarchy || [];
    }
    return payload;
}

async function mirrorWarehouseDefaultToPostgres(mongoWarehouse) {
    if (!mongoWarehouse?.isDefault) return;
    const repo = getWarehouseRepository();
    const pgRow = await repo.findByLegacyId(String(mongoWarehouse._id));
    if (pgRow) {
        await repo.setDefault(pgRow.id);
    }
}

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function parseBoolean(value) {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return undefined;
}

function pickWarehouseFields(body) {
    const fields = {};

    if (body.name !== undefined) fields.name = String(body.name).trim();
    if (body.location !== undefined) fields.location = String(body.location).trim();
    if (body.address !== undefined) fields.address = String(body.address).trim();
    if (body.managerName !== undefined) fields.managerName = String(body.managerName).trim();
    if (body.phone !== undefined) fields.phone = String(body.phone).trim();
    if (body.status !== undefined) {
        const status = String(body.status).trim().toLowerCase();
        if (status === 'active' || status === 'inactive') fields.status = status;
    }
    if (body.locationHierarchy !== undefined && Array.isArray(body.locationHierarchy)) {
        fields.locationHierarchy = body.locationHierarchy;
    }

    return fields;
}

/** Clear isDefault everywhere except `keepId`, so only one default survives. */
async function demoteOtherDefaults(keepId) {
    const filter = { isDefault: true };
    if (keepId) filter._id = { $ne: keepId };
    await Warehouse.updateMany(filter, { $set: { isDefault: false } });
}

async function attachWarehouseProductCounts(warehouses) {
    if (!warehouses.length) return warehouses;
    const counts = await Product.aggregate([
        { $match: { warehouseId: { $in: warehouses.map((w) => w._id) } } },
        { $group: { _id: '$warehouseId', productCount: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((row) => [String(row._id), row.productCount]));
    return warehouses.map((w) => ({
        ...w,
        productCount: countMap.get(String(w._id)) || 0
    }));
}

async function fetchWarehousesList(filter, sortMode) {
    return routedRead(
        'warehouse',
        async () => {
            const sort = sortMode === 'dropdown'
                ? { isDefault: -1, name: 1 }
                : { isDefault: -1, createdAt: -1 };
            return Warehouse.find(filter).sort(sort).lean();
        },
        async () => {
            const rows = await getWarehouseRepository().findAll({ status: filter.status });
            let shaped = mapWarehousesToMongo(rows);
            if (sortMode === 'dropdown') {
                shaped.sort((a, b) => {
                    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
                    return String(a.name).localeCompare(String(b.name));
                });
            } else {
                shaped.sort((a, b) => {
                    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
            }
            return shaped;
        }
    );
}

/**
 * GET /api/admin/warehouses
 * Paginated locations, default first. ?all=true returns the full list for
 * dropdowns; ?status=active|inactive filters.
 */
exports.getAllWarehouses = async (req, res) => {
    try {
        const filter = {};

        const status = String(req.query.status || '').trim().toLowerCase();
        if (status === 'active' || status === 'inactive') {
            filter.status = status;
        }

        if (String(req.query.all || '').toLowerCase() === 'true') {
            const warehouses = await fetchWarehousesList(filter, 'dropdown');
            return res.status(200).json({
                success: true,
                data: warehouses,
                pagination: { page: 1, limit: warehouses.length, total: warehouses.length, totalPages: 1 }
            });
        }

        const { page, limit, skip } = parsePagination(req.query);

        const [allMatching, total] = await routedRead(
            'warehouse',
            () => Promise.all([
                Warehouse.find(filter)
                    .sort({ isDefault: -1, createdAt: -1 })
                    .lean(),
                Warehouse.countDocuments(filter)
            ]),
            async () => {
                const all = await fetchWarehousesList(filter, 'paginated');
                return [all, all.length];
            }
        );

        const warehouses = await attachWarehouseProductCounts(
            allMatching.slice(skip, skip + limit)
        );

        res.status(200).json({
            success: true,
            data: warehouses,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('getAllWarehouses Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load warehouses.' });
    }
};

/** GET /api/admin/warehouses/:id */
exports.getWarehouseById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid warehouse id.' });
        }

        const warehouse = await routedRead(
            'warehouse',
            () => Warehouse.findById(id).lean(),
            async () => {
                const row = await getWarehouseRepository().findByLegacyId(id);
                return row ? warehouseToMongoShape(row) : null;
            }
        );
        if (!warehouse) {
            return res.status(404).json({ success: false, message: 'Warehouse not found.' });
        }

        const productCount = await Product.countDocuments({ warehouseId: id });

        res.status(200).json({ success: true, data: { ...warehouse, productCount } });
    } catch (error) {
        console.error('getWarehouseById Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load warehouse.' });
    }
};

/**
 * POST /api/admin/warehouses
 * The very first location becomes the default automatically.
 */
exports.createWarehouse = async (req, res) => {
    try {
        const fields = pickWarehouseFields(req.body || {});

        if (!fields.name) {
            return res.status(400).json({ success: false, message: 'Warehouse name is required.' });
        }

        const existingCount = await Warehouse.countDocuments();
        const wantsDefault = parseBoolean(req.body?.isDefault);

        fields.isDefault = existingCount === 0 ? true : wantsDefault === true;
        fields.createdBy = req.adminId || null;

        const warehouse = await dualWrite(
            async () => {
                const created = await Warehouse.create(fields);
                if (created.isDefault) {
                    await demoteOtherDefaults(created._id);
                }
                return created;
            },
            async (saved) => {
                const repo = getWarehouseRepository();
                await repo.create(mapMongoWarehouseToPostgresCreate(saved));
                await mirrorWarehouseDefaultToPostgres(saved);
            },
            {
                model: 'Warehouse',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Warehouse Created',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: warehouse.name,
            resourceType: 'warehouse',
            resourceId: String(warehouse._id)
        });

        res.status(201).json({ success: true, message: 'Warehouse created.', data: warehouse });
    } catch (error) {
        console.error('createWarehouse Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create warehouse.' });
    }
};

/**
 * PUT /api/admin/warehouses/:id
 * Promoting to default demotes the previous default. The current default
 * cannot demote itself — promote another location instead.
 */
exports.updateWarehouse = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid warehouse id.' });
        }

        const warehouse = await Warehouse.findById(id);
        if (!warehouse) {
            return res.status(404).json({ success: false, message: 'Warehouse not found.' });
        }

        const fields = pickWarehouseFields(req.body || {});

        if (fields.name !== undefined && !fields.name) {
            return res.status(400).json({ success: false, message: 'Warehouse name cannot be empty.' });
        }

        const wantsDefault = parseBoolean(req.body?.isDefault);
        if (wantsDefault === true) {
            fields.isDefault = true;
        } else if (wantsDefault === false && warehouse.isDefault) {
            return res.status(400).json({
                success: false,
                message: 'Promote another warehouse to default instead of un-setting this one.'
            });
        }

        // Deactivating the default would leave new products without a home.
        if (fields.status === 'inactive' && warehouse.isDefault) {
            return res.status(400).json({
                success: false,
                message: 'The default warehouse must stay active. Promote another location first.'
            });
        }

        if (!Object.keys(fields).length) {
            return res.status(400).json({ success: false, message: 'No changes supplied.' });
        }

        const updated = await dualWrite(
            async () => {
                const doc = await Warehouse.findByIdAndUpdate(
                    id,
                    { $set: fields },
                    { new: true, runValidators: true }
                );
                if (fields.isDefault === true && doc) {
                    await demoteOtherDefaults(doc._id);
                }
                return doc;
            },
            async (saved) => {
                const repo = getWarehouseRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (!pgRow) {
                    const err = new Error('Warehouse not found.');
                    err.code = 'NOT_FOUND';
                    throw err;
                }
                await repo.update(
                    pgRow.id,
                    mapMongoWarehouseFieldsToPostgresUpdate(saved, fields)
                );
                if (fields.isDefault === true) {
                    await repo.setDefault(pgRow.id);
                }
            },
            {
                model: 'Warehouse',
                operation: fields.isDefault === true ? 'setDefault' : 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Warehouse Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: updated.name,
            resourceType: 'warehouse',
            resourceId: String(updated._id)
        });

        res.status(200).json({ success: true, message: 'Warehouse updated.', data: updated });
    } catch (error) {
        console.error('updateWarehouse Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update warehouse.' });
    }
};

/**
 * DELETE /api/admin/warehouses/:id
 * The default location is protected. Products and open POs stored here are
 * moved back to "no specific warehouse" rather than left dangling.
 */
exports.deleteWarehouse = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid warehouse id.' });
        }

        const warehouse = await Warehouse.findById(id);
        if (!warehouse) {
            return res.status(404).json({ success: false, message: 'Warehouse not found.' });
        }

        if (warehouse.isDefault) {
            return res.status(409).json({
                success: false,
                message: 'The default warehouse cannot be deleted. Promote another location to default first.'
            });
        }

        await Product.updateMany({ warehouseId: id }, { $set: { warehouseId: null } });
        await PurchaseOrder.updateMany({ warehouseId: id }, { $set: { warehouseId: null } });
        await dualWrite(
            () => Warehouse.findByIdAndDelete(id),
            async () => {
                const repo = getWarehouseRepository();
                const pgRow = await repo.findByLegacyId(id);
                if (pgRow) {
                    await repo.remove(pgRow.id);
                }
            },
            {
                model: 'Warehouse',
                operation: 'delete',
                mongoId: id
            }
        );

        await logSecurityEvent({
            action: 'Warehouse Deleted',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: warehouse.name,
            resourceType: 'warehouse',
            resourceId: String(warehouse._id)
        });

        res.status(200).json({ success: true, message: 'Warehouse deleted.' });
    } catch (error) {
        console.error('deleteWarehouse Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete warehouse.' });
    }
};
