/********************************************************************
 * Project: EonlineBazar — WMS
 * File: warehouseTransferController.js
 * Location: controllers/admin/warehouseTransferController.js
 * Description: Inter-warehouse stock transfer CRUD and state transitions.
 ********************************************************************/

const mongoose = require('mongoose');
const WarehouseTransfer = require('../../models/WarehouseTransfer');
const StockLedger = require('../../models/StockLedger');
const { routedRead } = require('../../services/readRouter');
const { dualWrite } = require('../../services/dualWriteService');
const wmsService = require('../../services/wmsService');
const { listLedgerEntries } = require('../../services/stockLedgerService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

function getTransferRepository() {
    return require('../../repositories/warehouseTransferRepository');
}

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

async function fetchTransfersList(filters) {
    return routedRead(
        'warehousetransfer',
        async () => {
            const query = {};
            if (filters.status) query.status = filters.status;
            const [data, total] = await Promise.all([
                WarehouseTransfer.find(query)
                    .sort({ createdAt: -1 })
                    .skip(filters.skip)
                    .limit(filters.limit)
                    .lean(),
                WarehouseTransfer.countDocuments(query)
            ]);
            return { data, total };
        },
        async () => {
            const repo = getTransferRepository();
            const data = await repo.listFromPG({ status: filters.status, limit: filters.limit });
            return { data, total: data.length };
        }
    );
}

async function fetchTransferById(id) {
    return routedRead(
        'warehousetransfer',
        () => WarehouseTransfer.findById(id).lean(),
        () => getTransferRepository().findByIdFromPG(id)
    );
}

exports.getAllTransfers = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const status = String(req.query.status || '').trim().toLowerCase() || undefined;

        const { data, total } = await fetchTransfersList({ status, skip, limit });

        return res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit) || 1
            }
        });
    } catch (err) {
        console.error('[warehouseTransferController.getAllTransfers]', err);
        return res.status(500).json({ success: false, message: 'Could not load warehouse transfers.' });
    }
};

exports.getTransferById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid transfer id.' });
        }

        const transfer = await fetchTransferById(id);
        if (!transfer) {
            return res.status(404).json({ success: false, message: 'Transfer not found.' });
        }

        return res.json({ success: true, data: transfer });
    } catch (err) {
        console.error('[warehouseTransferController.getTransferById]', err);
        return res.status(500).json({ success: false, message: 'Could not load transfer.' });
    }
};

exports.createTransfer = async (req, res) => {
    try {
        const transfer = await wmsService.createTransferDraft({
            sourceWarehouseId: req.body.sourceWarehouseId,
            destinationWarehouseId: req.body.destinationWarehouseId,
            items: req.body.items,
            notes: req.body.notes,
            createdBy: req.account?._id || req.admin?._id || null,
            createdByName: req.account?.name || req.admin?.username || ''
        });

        await dualWrite(
            async () => transfer,
            async (doc) => getTransferRepository().createFromMongo(doc),
            { model: 'WarehouseTransfer', operation: 'create', mongoId: (d) => String(d._id) }
        );

        await logSecurityEvent({
            action: 'WAREHOUSE_TRANSFER_CREATED',
            actor: req.account?.username || req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Transfer ${transfer.transferNumber} created`,
            resourceType: 'WarehouseTransfer',
            resourceId: String(transfer._id)
        });

        return res.status(201).json({ success: true, data: transfer });
    } catch (err) {
        const message = err.message || 'Could not create transfer.';
        const status = message.includes('needs at least one') ? 400 : 500;
        return res.status(status).json({ success: false, message });
    }
};

exports.updateTransfer = async (req, res) => {
    try {
        const { id } = req.params;
        const transfer = await WarehouseTransfer.findById(id);
        if (!transfer) {
            return res.status(404).json({ success: false, message: 'Transfer not found.' });
        }
        if (transfer.status !== 'draft') {
            return res.status(400).json({ success: false, message: 'Only draft transfers can be edited.' });
        }

        if (req.body.items) {
            const normalised = await wmsService.normaliseTransferItems(req.body.items);
            if (normalised.error) {
                return res.status(400).json({ success: false, message: normalised.error });
            }
            transfer.items = normalised.items;
        }
        if (req.body.notes !== undefined) transfer.notes = String(req.body.notes || '').trim();
        if (req.body.sourceWarehouseId) transfer.sourceWarehouseId = req.body.sourceWarehouseId;
        if (req.body.destinationWarehouseId) transfer.destinationWarehouseId = req.body.destinationWarehouseId;

        await dualWrite(
            async () => {
                await transfer.save();
                return transfer;
            },
            async (doc) => getTransferRepository().updateFromMongo(doc),
            { model: 'WarehouseTransfer', operation: 'update', mongoId: String(transfer._id) }
        );

        return res.json({ success: true, data: transfer });
    } catch (err) {
        console.error('[warehouseTransferController.updateTransfer]', err);
        return res.status(500).json({ success: false, message: err.message || 'Could not update transfer.' });
    }
};

exports.shipTransfer = async (req, res) => {
    try {
        const { id } = req.params;
        const performedBy = req.account?._id || req.admin?._id || null;

        const transfer = await wmsService.shipTransfer(id, performedBy);

        await dualWrite(
            async () => transfer,
            async (doc) => getTransferRepository().updateFromMongo(doc),
            { model: 'WarehouseTransfer', operation: 'ship', mongoId: String(transfer._id) }
        );

        await logSecurityEvent({
            action: 'WAREHOUSE_TRANSFER_SHIPPED',
            actor: req.account?.username || req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Transfer ${transfer.transferNumber} shipped`,
            resourceType: 'WarehouseTransfer',
            resourceId: String(transfer._id)
        });

        return res.json({ success: true, data: transfer });
    } catch (err) {
        const status = err.message.includes('not found') ? 404
            : err.message.includes('cannot ship') || err.message.includes('Insufficient') ? 400
                : 500;
        return res.status(status).json({ success: false, message: err.message });
    }
};

exports.receiveTransfer = async (req, res) => {
    try {
        const { id } = req.params;
        const performedBy = req.account?._id || req.admin?._id || null;
        const receivedLines = Array.isArray(req.body.items) ? req.body.items : req.body.receivedLines;

        const transfer = await wmsService.receiveTransfer(id, receivedLines, performedBy);

        await dualWrite(
            async () => transfer,
            async (doc) => getTransferRepository().updateFromMongo(doc),
            { model: 'WarehouseTransfer', operation: 'receive', mongoId: String(transfer._id) }
        );

        await logSecurityEvent({
            action: 'WAREHOUSE_TRANSFER_RECEIVED',
            actor: req.account?.username || req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Transfer ${transfer.transferNumber} received (${transfer.status})`,
            resourceType: 'WarehouseTransfer',
            resourceId: String(transfer._id)
        });

        return res.json({ success: true, data: transfer });
    } catch (err) {
        const status = err.message.includes('not found') ? 404
            : err.message.includes('cannot be received') || err.message.includes('Invalid') ? 400
                : 500;
        return res.status(status).json({ success: false, message: err.message });
    }
};

exports.getStockLedger = async (req, res) => {
    try {
        const entries = await listLedgerEntries({
            productId: req.query.productId,
            warehouseId: req.query.warehouseId,
            movementType: req.query.movementType,
            referenceId: req.query.referenceId,
            limit: req.query.limit
        });

        return res.json({ success: true, data: entries });
    } catch (err) {
        console.error('[warehouseTransferController.getStockLedger]', err);
        return res.status(500).json({ success: false, message: 'Could not load stock ledger.' });
    }
};

exports.verifyLedgerImmutable = async (req, res) => {
    try {
        const entry = await StockLedger.findOne().sort({ createdAt: -1 });
        if (!entry) {
            return res.json({ success: true, immutable: true, message: 'No ledger rows yet.' });
        }

        try {
            await StockLedger.updateOne({ _id: entry._id }, { $set: { notes: 'tamper attempt' } });
            return res.status(500).json({ success: false, immutable: false });
        } catch (err) {
            return res.json({
                success: true,
                immutable: true,
                message: err.message
            });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
