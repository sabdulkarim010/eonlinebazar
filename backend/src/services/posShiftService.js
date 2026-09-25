/********************************************************************
 * POS shift register — open, track sales, close with cash reconciliation.
 ********************************************************************/

'use strict';

const PosShift = require('../models/posShift');
const { roundMoney } = require('./deliveryChargeService');

const CASH_METHODS = new Set(['CASH', 'COD']);

function isCashPaymentMethod(method) {
    const key = String(method || '').trim().toUpperCase();
    return CASH_METHODS.has(key);
}

function normalizeRegisterName(name) {
    return String(name || 'Main Register').trim() || 'Main Register';
}

async function findOpenShiftConflict({ cashierId, registerName }) {
    const register = normalizeRegisterName(registerName);
    return PosShift.findOne({
        status: 'OPEN',
        $or: [
            { registerName: register },
            { cashierId }
        ]
    }).sort({ openedAt: -1 });
}

async function openShift({ cashierId, cashierName, registerName, startingCash = 0, notes = '' }) {
    const register = normalizeRegisterName(registerName);
    const conflict = await findOpenShiftConflict({ cashierId, registerName: register });
    if (conflict) {
        const err = new Error('An active shift is already open for this register or cashier.');
        err.code = 'SHIFT_ALREADY_OPEN';
        err.shiftId = String(conflict._id);
        throw err;
    }

    const shift = await PosShift.create({
        registerName: register,
        cashierId,
        cashierName: String(cashierName || '').trim(),
        startingCash: roundMoney(startingCash),
        expectedCash: roundMoney(startingCash),
        openNotes: String(notes || '').trim(),
        status: 'OPEN',
        openedAt: new Date()
    });

    return shift.toObject();
}

async function getCurrentShift({ cashierId, registerName }) {
    const query = { status: 'OPEN', cashierId };
    if (registerName) query.registerName = normalizeRegisterName(registerName);

    const shift = await PosShift.findOne(query).sort({ openedAt: -1 }).lean();
    if (!shift) return null;

    return {
        ...shift,
        expectedCash: roundMoney(Number(shift.startingCash) + Number(shift.totalCashSales)),
        expectedDigital: roundMoney(Number(shift.totalDigitalSales))
    };
}

async function recordShiftSale(shiftId, payments = [], orderTotal = 0) {
    if (!shiftId) return null;

    const shift = await PosShift.findById(shiftId);
    if (!shift || shift.status !== 'OPEN') return null;

    let cashAmount = 0;
    let digitalAmount = 0;

    if (Array.isArray(payments) && payments.length) {
        payments.forEach((line) => {
            const amount = roundMoney(line.amount);
            if (amount <= 0) return;
            if (isCashPaymentMethod(line.method)) cashAmount += amount;
            else digitalAmount += amount;
        });
    } else {
        digitalAmount = roundMoney(orderTotal);
    }

    shift.totalCashSales = roundMoney(Number(shift.totalCashSales) + cashAmount);
    shift.totalDigitalSales = roundMoney(Number(shift.totalDigitalSales) + digitalAmount);
    shift.totalSales = roundMoney(Number(shift.totalSales) + roundMoney(orderTotal));
    shift.orderCount = Number(shift.orderCount) + 1;
    shift.expectedCash = roundMoney(Number(shift.startingCash) + Number(shift.totalCashSales));
    shift.expectedDigital = roundMoney(Number(shift.totalDigitalSales));

    await shift.save();
    return shift.toObject();
}

async function closeShift({ shiftId, cashierId, actualCash, notes = '' }) {
    const shift = await PosShift.findById(shiftId);
    if (!shift) {
        const err = new Error('Shift not found.');
        err.code = 'SHIFT_NOT_FOUND';
        throw err;
    }
    if (String(shift.cashierId) !== String(cashierId)) {
        const err = new Error('You can only close your own active shift.');
        err.code = 'SHIFT_FORBIDDEN';
        throw err;
    }
    if (shift.status === 'CLOSED') {
        const err = new Error('Shift is already closed.');
        err.code = 'SHIFT_ALREADY_CLOSED';
        throw err;
    }

    const expectedCash = roundMoney(Number(shift.startingCash) + Number(shift.totalCashSales));
    const countedCash = roundMoney(actualCash);
    const cashDiscrepancy = roundMoney(countedCash - expectedCash);

    shift.actualCash = countedCash;
    shift.expectedCash = expectedCash;
    shift.expectedDigital = roundMoney(Number(shift.totalDigitalSales));
    shift.cashDiscrepancy = cashDiscrepancy;
    shift.closeNotes = String(notes || '').trim();
    shift.status = 'CLOSED';
    shift.closedAt = new Date();

    await shift.save();
    return shift.toObject();
}

async function listShifts({ page = 1, limit = 20, startDate, endDate, status, registerName } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = {};
    if (status && PosShift.STATUSES.includes(String(status).toUpperCase())) {
        filter.status = String(status).toUpperCase();
    }
    if (registerName) filter.registerName = normalizeRegisterName(registerName);

    if (startDate || endDate) {
        filter.openedAt = {};
        if (startDate) {
            const start = new Date(startDate);
            if (!Number.isNaN(start.getTime())) filter.openedAt.$gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            if (!Number.isNaN(end.getTime())) {
                end.setHours(23, 59, 59, 999);
                filter.openedAt.$lte = end;
            }
        }
    }

    const [rows, total] = await Promise.all([
        PosShift.find(filter).sort({ openedAt: -1 }).skip(skip).limit(safeLimit).lean(),
        PosShift.countDocuments(filter)
    ]);

    return {
        shifts: rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: total > 0 ? Math.ceil(total / safeLimit) : 0
        }
    };
}

module.exports = {
    isCashPaymentMethod,
    openShift,
    getCurrentShift,
    recordShiftSale,
    closeShift,
    listShifts
};
