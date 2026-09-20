/********************************************************************
 * Order status history — append-only audit trail on Order documents.
 ********************************************************************/

const { dualWrite } = require('../services/dualWriteService');

function getOrderDualWriteHelpers() {
    return require('./orderDualWriteHelpers');
}

function normalizeEntry(entry = {}) {
    return {
        status: String(entry.status || '').trim(),
        changedAt: entry.changedAt ? new Date(entry.changedAt) : new Date(),
        changedBy: String(entry.changedBy || 'system').trim(),
        note: String(entry.note || '').trim()
    };
}

function appendStatusHistory(orderDoc, { status, changedBy = 'system', note = '' } = {}) {
    if (!orderDoc || !status) return orderDoc;

    const nextStatus = String(status).trim();
    const current = String(orderDoc.status || '').trim();
    const history = Array.isArray(orderDoc.statusHistory) ? [...orderDoc.statusHistory] : [];

    const last = history[history.length - 1];
    if (last && String(last.status).toLowerCase() === nextStatus.toLowerCase() && current.toLowerCase() === nextStatus.toLowerCase()) {
        return orderDoc;
    }

    history.push(normalizeEntry({ status: nextStatus, changedBy, note }));
    orderDoc.statusHistory = history;
    return orderDoc;
}

function seedInitialStatusHistory(orderDoc, changedBy = 'system') {
    if (!orderDoc) return orderDoc;
    if (Array.isArray(orderDoc.statusHistory) && orderDoc.statusHistory.length) return orderDoc;

    const status = orderDoc.status || 'Pending';
    orderDoc.statusHistory = [
        normalizeEntry({
            status,
            changedBy,
            note: 'Order placed'
        })
    ];

    if (String(status).toLowerCase() !== 'pending') {
        orderDoc.statusHistory.unshift(
            normalizeEntry({ status: 'Pending', changedAt: orderDoc.createdAt || new Date(), changedBy: 'system', note: 'Order placed' })
        );
    }

    return orderDoc;
}

async function mirrorStatusHistory(orderDoc) {
    try {
        await getOrderDualWriteHelpers().mirrorOrderStatusHistory(orderDoc);
    } catch (err) {
        console.error('[DUAL-WRITE-ORDER-STATUS-HISTORY-FAIL]', err.message);
    }
}

async function persistStatusHistory(orderDoc) {
    if (!orderDoc) return;
    await dualWrite(
        () => orderDoc.save(),
        async (saved) => { await mirrorStatusHistory(saved); },
        {
            model: 'Order',
            operation: 'statusHistory',
            mongoId: (saved) => String(saved._id)
        }
    );
}

module.exports = {
    appendStatusHistory,
    seedInitialStatusHistory,
    persistStatusHistory,
    normalizeEntry
};
