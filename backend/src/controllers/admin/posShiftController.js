/********************************************************************
 * Admin POS shift register endpoints.
 ********************************************************************/

'use strict';

const {
    openShift,
    getCurrentShift,
    closeShift,
    listShifts
} = require('../../services/posShiftService');

function resolveCashier(req) {
    return {
        id: req.adminId || req.adminAccount?._id,
        name: req.admin?.username || req.adminAccount?.username || req.admin?.displayName || 'admin'
    };
}

const openPosShift = async (req, res) => {
    try {
        const cashier = resolveCashier(req);
        if (!cashier.id) {
            return res.status(401).json({ success: false, message: 'Admin session required.' });
        }

        const shift = await openShift({
            cashierId: cashier.id,
            cashierName: cashier.name,
            registerName: req.body?.registerName,
            startingCash: req.body?.startingCash,
            notes: req.body?.notes
        });

        return res.status(201).json({
            success: true,
            message: 'POS shift opened.',
            data: shift
        });
    } catch (err) {
        if (err.code === 'SHIFT_ALREADY_OPEN') {
            return res.status(409).json({
                success: false,
                message: err.message,
                shiftId: err.shiftId
            });
        }
        console.error('openPosShift error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

const getCurrentPosShift = async (req, res) => {
    try {
        const cashier = resolveCashier(req);
        const shift = await getCurrentShift({
            cashierId: cashier.id,
            registerName: req.query?.registerName
        });

        if (!shift) {
            return res.status(404).json({ success: false, message: 'No active shift found.' });
        }

        return res.json({ success: true, data: shift });
    } catch (err) {
        console.error('getCurrentPosShift error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

const closePosShift = async (req, res) => {
    try {
        const cashier = resolveCashier(req);
        const shiftId = req.body?.shiftId || req.body?.id;
        if (!shiftId) {
            return res.status(400).json({ success: false, message: 'shiftId is required.' });
        }
        if (req.body?.actualCash === undefined || req.body?.actualCash === null) {
            return res.status(400).json({ success: false, message: 'actualCash is required.' });
        }

        const shift = await closeShift({
            shiftId,
            cashierId: cashier.id,
            actualCash: req.body.actualCash,
            notes: req.body?.notes
        });

        return res.json({
            success: true,
            message: 'POS shift closed.',
            data: shift
        });
    } catch (err) {
        if (err.code === 'SHIFT_NOT_FOUND') {
            return res.status(404).json({ success: false, message: err.message });
        }
        if (err.code === 'SHIFT_FORBIDDEN' || err.code === 'SHIFT_ALREADY_CLOSED') {
            return res.status(400).json({ success: false, message: err.message });
        }
        console.error('closePosShift error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

const listPosShifts = async (req, res) => {
    try {
        const payload = await listShifts({
            page: req.query?.page,
            limit: req.query?.limit,
            startDate: req.query?.startDate || req.query?.date,
            endDate: req.query?.endDate,
            status: req.query?.status,
            registerName: req.query?.registerName
        });

        return res.json({ success: true, data: payload });
    } catch (err) {
        console.error('listPosShifts error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    openPosShift,
    getCurrentPosShift,
    closePosShift,
    listPosShifts
};
