/********************************************************************
 * Project: EonlineBazar
 * File: orderDualWriteHelpers.js
 * Location: backend/src/utils/orderDualWriteHelpers.js
 * Description: Dual-write mirrors for Order (Stage 2 Step 3, Part 8).
 *   Partial-write logging identifies which child table failed when the
 *   Order row already exists in Postgres — for Stage 3 targeted repair.
 ********************************************************************/

'use strict';

function getOrderRepository() {
  return require('../repositories/orderRepository');
}

function toPlain(doc) {
  return doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

async function mirrorOrderCreate(mongoDoc) {
  const repo = getOrderRepository();
  const legacyId = mongoDoc._id != null ? String(mongoDoc._id) : null;

  try {
    await repo.createFromMongo(mongoDoc);
  } catch (err) {
    if (!legacyId) throw err;

    const existing = await repo.findByLegacyId(legacyId);
    if (existing) {
      console.error('[DUAL-WRITE-ORDER-PARTIAL]', {
        timestamp: new Date().toISOString(),
        mongoId: legacyId,
        legacyId,
        postgresOrderId: existing.id,
        failedStage: err.dualWriteStage || 'unknown',
        error: err.message || String(err)
      });
      return;
    }

    throw err;
  }
}

async function mirrorOrderStatusUpdate(mongoDoc) {
  const repo = getOrderRepository();
  const legacyId = String(mongoDoc._id);
  const plain = toPlain(mongoDoc);

  try {
    if (plain.status !== undefined) {
      await repo.updateStatusByLegacyId(legacyId, plain.status);
    }
    await repo.updateOrderFieldsByLegacyId(legacyId, plain);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      await mirrorOrderCreate(mongoDoc);
      return;
    }
    throw err;
  }
}

async function mirrorOrderPayment(mongoDoc) {
  const repo = getOrderRepository();
  const plain = toPlain(mongoDoc);
  if (!plain.payment || typeof plain.payment !== 'object') return;

  const legacyId = String(mongoDoc._id);
  try {
    await repo.updatePaymentByLegacyId(legacyId, plain.payment);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return;
    throw err;
  }
}

async function mirrorOrderPaymentIpn(mongoDoc) {
  const plain = toPlain(mongoDoc);
  if (!plain.payment || typeof plain.payment !== 'object') return;

  const ipnHistory = Array.isArray(plain.payment.ipnHistory) ? plain.payment.ipnHistory : [];
  if (ipnHistory.length === 0) return;

  const latest = ipnHistory[ipnHistory.length - 1];
  const repo = getOrderRepository();
  const legacyId = String(mongoDoc._id);

  try {
    await repo.updatePaymentByLegacyId(legacyId, plain.payment);
    await repo.addPaymentIpnEventByLegacyId(legacyId, latest);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return;
    throw err;
  }
}

async function mirrorOrderNotifications(mongoDoc) {
  const plain = toPlain(mongoDoc);
  if (!plain.notificationsSent || typeof plain.notificationsSent !== 'object') return;

  const repo = getOrderRepository();
  const legacyId = String(mongoDoc._id);

  try {
    await repo.updateNotificationsByLegacyId(legacyId, plain.notificationsSent);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return;
    throw err;
  }
}

async function mirrorOrderReturnItems(mongoDoc) {
  const plain = toPlain(mongoDoc);
  if (!Array.isArray(plain.returnItems) || plain.returnItems.length === 0) return;

  const repo = getOrderRepository();
  const legacyId = String(mongoDoc._id);

  try {
    await repo.syncReturnItemsByLegacyId(legacyId, plain.returnItems);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return;
    throw err;
  }
}

async function mirrorOrderPaymentProof(mongoDoc) {
  const plain = toPlain(mongoDoc);
  if (!plain.paymentProof || typeof plain.paymentProof !== 'object') return;

  const repo = getOrderRepository();
  const legacyId = String(mongoDoc._id);

  try {
    await repo.upsertPaymentProofByLegacyId(legacyId, plain.paymentProof);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return;
    throw err;
  }
}

async function mirrorOrderReturnFlow(mongoDoc) {
  await mirrorOrderStatusUpdate(mongoDoc);
  await mirrorOrderReturnItems(mongoDoc);
  await mirrorOrderNotifications(mongoDoc);
}

async function mirrorOrderStatusHistory(mongoDoc) {
  const plain = toPlain(mongoDoc);
  const history = Array.isArray(plain.statusHistory) ? plain.statusHistory : [];
  if (history.length === 0) return;

  const repo = getOrderRepository();
  const legacyId = String(mongoDoc._id);

  try {
    await repo.syncStatusHistoryByLegacyId(legacyId, history);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return;
    throw err;
  }
}

module.exports = {
  mirrorOrderCreate,
  mirrorOrderStatusUpdate,
  mirrorOrderPayment,
  mirrorOrderPaymentIpn,
  mirrorOrderNotifications,
  mirrorOrderReturnItems,
  mirrorOrderPaymentProof,
  mirrorOrderReturnFlow,
  mirrorOrderStatusHistory
};
