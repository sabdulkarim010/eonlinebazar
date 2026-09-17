/********************************************************************
 * Project: EonlineBazar
 * File: orderRepository.js
 * Location: backend/src/repositories/orderRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for Order and decomposed child tables
 *   (OrderItem, OrderReturnItem, OrderPayment, OrderPaymentIpnEvent,
 *   OrderPaymentProof, OrderNotification).
 *
 *   KNOWN LIMITATION: create() uses sequential writes (no $transaction) because
 *   Neon HTTP driver does not support interactive transactions. A failure after
 *   the Order row is created can leave a partial order — see DATABASE_MIGRATION_AUDIT.md.
 *
 *   Wired for dual-write — Stage 2 Step 3, Part 8 (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const { UUID_PATTERN } = require('./productRepository');
const { resolvePostgresUserId } = require('./userRepository');

function attachDualWriteStage(err, stage, postgresOrderId) {
  const wrapped = err instanceof Error ? err : new Error(String(err));
  wrapped.dualWriteStage = stage;
  wrapped.postgresOrderId = postgresOrderId || null;
  return wrapped;
}

function logOrderFkMissing(field, mongoRefId) {
  console.error('[DUAL-WRITE-FK-MISSING]', {
    timestamp: new Date().toISOString(),
    model: 'Order',
    field,
    mongoRefId: String(mongoRefId),
    message: `${field === 'userId' ? 'User' : 'Product'} not yet in Postgres`
  });
}

async function resolveProductIdForOrderItem(mongoProductRef) {
  const ref = String(mongoProductRef || '').trim();
  if (!ref) return null;

  if (UUID_PATTERN.test(ref)) {
    const byId = await prisma.product.findUnique({ where: { id: ref } });
    if (byId) return byId.id;
  }

  let row = await prisma.product.findUnique({ where: { legacyId: ref } });
  if (!row) row = await prisma.product.findUnique({ where: { productId: ref } });
  if (!row) {
    logOrderFkMissing('productId', ref);
    return null;
  }
  return row.id;
}

const ORDER_ITEM_COLUMNS = new Set([
  'id', 'productId', 'name', 'price', 'buyingPrice', 'quantity', 'image',
  'variantId', 'variantLabel', 'variantAttribute', 'variantValue', 'variantSku',
  'lineKey', 'legacyProductId', 'extraFields', 'orderId'
]);

const ORDER_STATUS_TO_ENUM = {
  Pending: 'PENDING',
  Processing: 'PROCESSING',
  Shipped: 'SHIPPED',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  Cancelled: 'CANCELLED',
  'Return Requested': 'RETURN_REQUESTED',
  Returned: 'RETURNED',
  'Refund Pending': 'REFUND_PENDING',
  Refunded: 'REFUNDED'
};

const ORDER_STATUS_FROM_ENUM = Object.fromEntries(
  Object.entries(ORDER_STATUS_TO_ENUM).map(([k, v]) => [v, k])
);

function toOrderStatusEnum(value) {
  if (!value) return 'PENDING';
  if (ORDER_STATUS_TO_ENUM[value]) return ORDER_STATUS_TO_ENUM[value];
  const key = String(value).toUpperCase().replace(/\s+/g, '_');
  if (ORDER_STATUS_FROM_ENUM[key]) return key;
  return 'PENDING';
}

function fromOrderStatusEnum(status) {
  return ORDER_STATUS_FROM_ENUM[status] || status;
}

function toShippingLocationEnum(value) {
  return String(value || '').toLowerCase().includes('outside') ? 'OUTSIDE_CITY' : 'INSIDE_CITY';
}

function fromShippingLocationEnum(value) {
  return value === 'OUTSIDE_CITY' ? 'Outside City' : 'Inside City';
}

function toDeliveryLocationEnum(value) {
  return String(value || '').toLowerCase() === 'outside' ? 'OUTSIDE' : 'INSIDE';
}

function fromDeliveryLocationEnum(value) {
  return value === 'OUTSIDE' ? 'outside' : 'inside';
}

function toCancelledByEnum(value) {
  const v = String(value || '').trim();
  if (v === 'Customer') return 'CUSTOMER';
  if (v === 'Admin') return 'ADMIN';
  return null;
}

function fromCancelledByEnum(value) {
  if (value === 'CUSTOMER') return 'Customer';
  if (value === 'ADMIN') return 'Admin';
  return '';
}

function toRefundMethodEnum(value) {
  const map = {
    wallet: 'WALLET',
    bkash: 'BKASH',
    nagad: 'NAGAD',
    original_payment: 'ORIGINAL_PAYMENT',
    cash: 'CASH'
  };
  return map[String(value || '').toLowerCase()] || 'WALLET';
}

function toOrderSourceEnum(value) {
  return String(value || '').toLowerCase() === 'manual' ? 'MANUAL' : 'ONLINE';
}

function toPaymentMethodTypeEnum(value) {
  return String(value || '').toLowerCase() === 'automated' ? 'AUTOMATED' : 'MANUAL';
}

function fromPaymentMethodTypeEnum(value) {
  return value === 'AUTOMATED' ? 'automated' : 'manual';
}

function toFeeTypeEnum(value) {
  return String(value || '').toLowerCase() === 'flat' ? 'FLAT' : 'PERCENTAGE';
}

function fromFeeTypeEnum(value) {
  return value === 'FLAT' ? 'flat' : 'percentage';
}

function toOrderPaymentStatusEnum(value) {
  const map = {
    unpaid: 'UNPAID',
    pending: 'PENDING',
    paid: 'PAID',
    failed: 'FAILED',
    cancelled: 'CANCELLED',
    refunded: 'REFUNDED'
  };
  return map[String(value || '').toLowerCase()] || 'UNPAID';
}

function fromOrderPaymentStatusEnum(value) {
  const map = {
    UNPAID: 'unpaid',
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded'
  };
  return map[value] || 'unpaid';
}

function toPaymentProofStatusEnum(value) {
  const map = {
    none: 'NONE',
    submitted: 'SUBMITTED',
    approved: 'APPROVED',
    rejected: 'REJECTED'
  };
  return map[String(value || '').toLowerCase()] || 'NONE';
}

function fromPaymentProofStatusEnum(value) {
  const map = {
    NONE: 'none',
    SUBMITTED: 'submitted',
    APPROVED: 'approved',
    REJECTED: 'rejected'
  };
  return map[value] || 'none';
}

function toReturnItemStatusEnum(value) {
  const map = { pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED' };
  return map[String(value || '').toLowerCase()] || 'PENDING';
}

function fromReturnItemStatusEnum(value) {
  const map = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };
  return map[value] || 'pending';
}

function splitOrderItem(item) {
  const extraFields = {};
  const row = {
    lineKey: item.id != null ? String(item.id) : null,
    legacyProductId: item.productId != null ? String(item.productId) : null,
    productId: null,
    name: item.name ?? null,
    price: item.price != null ? item.price : 0,
    buyingPrice: item.buyingPrice != null ? item.buyingPrice : 0,
    quantity: item.quantity != null ? Number(item.quantity) : 1,
    image: item.image ?? null,
    variantId: String(item.variantId ?? '').trim(),
    variantLabel: String(item.variantLabel ?? '').trim(),
    variantAttribute: String(item.variantAttribute ?? '').trim(),
    variantValue: String(item.variantValue ?? '').trim(),
    variantSku: String(item.variantSku ?? '').trim()
  };

  if (item.productId && UUID_PATTERN.test(String(item.productId))) {
    row.productId = String(item.productId);
  }

  Object.keys(item || {}).forEach((key) => {
    if (!ORDER_ITEM_COLUMNS.has(key)) {
      extraFields[key] = item[key];
    }
  });

  if (Object.keys(extraFields).length > 0) {
    row.extraFields = extraFields;
  }

  return row;
}

function mergeOrderItemRow(row) {
  const base = {
    id: row.lineKey ?? undefined,
    productId: row.legacyProductId ?? row.productId ?? undefined,
    name: row.name,
    price: Number(row.price),
    buyingPrice: Number(row.buyingPrice),
    quantity: row.quantity,
    image: row.image ?? undefined,
    variantId: row.variantId,
    variantLabel: row.variantLabel,
    variantAttribute: row.variantAttribute,
    variantValue: row.variantValue,
    variantSku: row.variantSku
  };

  if (row.extraFields && typeof row.extraFields === 'object') {
    Object.assign(base, row.extraFields);
  }

  return base;
}

function buildNotificationData(source = {}) {
  const s = source.notificationsSent || source;
  return {
    returnReceived: Boolean(s.returnReceived),
    returnApproved: Boolean(s.returnApproved),
    returnRejected: Boolean(s.returnRejected),
    refundProcessed: Boolean(s.refundProcessed),
    reviewReminder: Boolean(s.reviewReminder),
    processing: Boolean(s.processing),
    shipped: Boolean(s.shipped),
    outForDelivery: Boolean(s.outForDelivery ?? s.out_for_delivery),
    delivered: Boolean(s.delivered),
    cancelled: Boolean(s.cancelled)
  };
}

function notificationsToMongooseShape(notif) {
  if (!notif) return {};
  return {
    returnReceived: notif.returnReceived,
    returnApproved: notif.returnApproved,
    returnRejected: notif.returnRejected,
    refundProcessed: notif.refundProcessed,
    reviewReminder: notif.reviewReminder,
    processing: notif.processing,
    shipped: notif.shipped,
    out_for_delivery: notif.outForDelivery,
    delivered: notif.delivered,
    cancelled: notif.cancelled
  };
}

function buildOrderCreateData(orderData) {
  const d = orderData;
  return {
    legacyId: d.legacyId != null ? String(d.legacyId) : null,
    orderId: d.orderId ?? null,
    userId: d.userId ?? null,
    customerName: d.customerName ?? null,
    customerPhone: d.customerPhone ?? null,
    customerAddress: d.customerAddress ?? null,
    subTotal: d.subTotal != null ? d.subTotal : 0,
    deliveryCharge: d.deliveryCharge != null ? d.deliveryCharge : 0,
    grandTotal: d.grandTotal != null ? d.grandTotal : 0,
    shippingLocationType: toShippingLocationEnum(d.shippingLocationType),
    shippingDistrict: String(d.shippingDistrict ?? '').trim(),
    totalAmount: d.totalAmount != null ? d.totalAmount : null,
    totalBuyingPrice: d.totalBuyingPrice != null ? d.totalBuyingPrice : 0,
    subtotal: d.subtotal != null ? d.subtotal : 0,
    discountAmount: d.discountAmount != null ? d.discountAmount : 0,
    vatAmount: d.vatAmount != null ? d.vatAmount : 0,
    vatPercentage: d.vatPercentage != null ? d.vatPercentage : 0,
    vatEnabled: Boolean(d.vatEnabled),
    taxRegistrationNumber: String(d.taxRegistrationNumber ?? '').trim(),
    walletApplied: d.walletApplied != null ? d.walletApplied : 0,
    couponCode: String(d.couponCode ?? '').trim(),
    deliveryLocationType: toDeliveryLocationEnum(d.deliveryLocationType),
    shippingFee: d.shippingFee != null ? d.shippingFee : 0,
    paymentMethod: String(d.paymentMethod ?? 'COD').trim(),
    processingFee: d.processingFee != null ? d.processingFee : 0,
    status: toOrderStatusEnum(d.status),
    isDelivered: Boolean(d.isDelivered),
    deliveredAt: d.deliveredAt ?? null,
    cancelReason: String(d.cancelReason ?? '').trim(),
    cancelledBy: toCancelledByEnum(d.cancelledBy),
    returnReason: String(d.returnReason ?? '').trim(),
    returnRequestedAt: d.returnRequestedAt ?? null,
    refundMethod: toRefundMethodEnum(d.refundMethod),
    refundBkashNumber: String(d.refundBkashNumber ?? '').trim(),
    refundNagadNumber: String(d.refundNagadNumber ?? '').trim(),
    returnRejectedReason: String(d.returnRejectedReason ?? '').trim(),
    returnRejectedAt: d.returnRejectedAt ?? null,
    returnApprovedAt: d.returnApprovedAt ?? null,
    adminReturnNote: String(d.adminReturnNote ?? '').trim(),
    actionReason: String(d.actionReason ?? '').trim(),
    refundedAt: d.refundedAt ?? null,
    refundAmount: d.refundAmount != null ? d.refundAmount : 0,
    statusBeforeRefund: String(d.statusBeforeRefund ?? '').trim(),
    rewardsCredited: Boolean(d.rewardsCredited),
    rewardsPointsEarned: d.rewardsPointsEarned != null ? Number(d.rewardsPointsEarned) : 0,
    rewardsCashbackAmount: d.rewardsCashbackAmount != null ? d.rewardsCashbackAmount : 0,
    courierProvider: String(d.courierProvider ?? '').trim(),
    courierName: String(d.courierName ?? '').trim(),
    courierTrackingId: String(d.courierTrackingId ?? '').trim(),
    courierConsignmentId: String(d.courierConsignmentId ?? '').trim(),
    courierStatus: String(d.courierStatus ?? 'unbooked').trim(),
    courierBookedAt: d.courierBookedAt ?? null,
    courierSyncedAt: d.courierSyncedAt ?? null,
    note: String(d.note ?? '').trim(),
    estimatedDelivery: String(d.estimatedDelivery ?? '').trim(),
    orderSource: toOrderSourceEnum(d.orderSource),
    createdByAdmin: String(d.createdByAdmin ?? '').trim(),
    assignedStaffId: d.assignedStaffId ?? null,
    assignedAt: d.assignedAt ?? null,
    isSandbox: Boolean(d.isSandbox)
  };
}

function orderToShape(record) {
  if (!record) return null;

  const items = (record.items || []).map(mergeOrderItemRow);
  const returnItems = (record.returnItems || []).map((r) => ({
    _id: r.id,
    productId: r.legacyProductId ?? r.productId ?? '',
    productName: r.productName,
    quantity: r.quantity,
    price: Number(r.price),
    reason: r.reason,
    photos: r.photos,
    status: fromReturnItemStatusEnum(r.status)
  }));

  let payment = null;
  if (record.payment) {
    payment = {
      methodId: record.payment.methodId,
      code: record.payment.code,
      name: record.payment.name,
      type: fromPaymentMethodTypeEnum(record.payment.type),
      provider: record.payment.provider,
      accountNumber: record.payment.accountNumber,
      gatewayStoreId: record.payment.gatewayStoreId,
      isSandbox: record.payment.isSandbox,
      processingFee: Number(record.payment.processingFee),
      feeType: fromFeeTypeEnum(record.payment.feeType),
      feeRate: Number(record.payment.feeRate),
      feeBaseAmount: Number(record.payment.feeBaseAmount),
      status: fromOrderPaymentStatusEnum(record.payment.status),
      transactionId: record.payment.transactionId,
      gatewayReference: record.payment.gatewayReference,
      paidAt: record.payment.paidAt,
      settledFromWallet: record.payment.settledFromWallet,
      ipnHistory: (record.payment.ipnHistory || []).map((e) => ({
        receivedAt: e.receivedAt,
        provider: e.provider,
        status: e.status,
        verified: e.verified,
        transactionId: e.transactionId,
        amount: Number(e.amount),
        message: e.message,
        raw: e.raw
      }))
    };
  }

  let paymentProof = null;
  if (record.paymentProof) {
    paymentProof = {
      trxId: record.paymentProof.trxId,
      screenshotUrl: record.paymentProof.screenshotUrl,
      submittedAt: record.paymentProof.submittedAt,
      reviewedAt: record.paymentProof.reviewedAt,
      reviewedBy: record.paymentProof.reviewedById,
      status: fromPaymentProofStatusEnum(record.paymentProof.status),
      adminNote: record.paymentProof.adminNote
    };
  }

  return {
    ...record,
    _id: record.id,
    user: record.userId,
    status: fromOrderStatusEnum(record.status),
    shippingLocationType: fromShippingLocationEnum(record.shippingLocationType),
    deliveryLocationType: fromDeliveryLocationEnum(record.deliveryLocationType),
    cancelledBy: fromCancelledByEnum(record.cancelledBy),
    subTotal: Number(record.subTotal),
    subtotal: Number(record.subtotal),
    deliveryCharge: Number(record.deliveryCharge),
    grandTotal: Number(record.grandTotal),
    totalAmount: record.totalAmount != null ? Number(record.totalAmount) : null,
    totalBuyingPrice: Number(record.totalBuyingPrice),
    discountAmount: Number(record.discountAmount),
    walletApplied: Number(record.walletApplied),
    processingFee: Number(record.processingFee),
    refundAmount: Number(record.refundAmount),
    rewardsCashbackAmount: Number(record.rewardsCashbackAmount),
    items,
    returnItems,
    payment,
    paymentProof,
    notificationsSent: notificationsToMongooseShape(record.notificationsSent)
  };
}

// ── create ───────────────────────────────────────────────────────────────────
// Sequential writes — partial order risk if a child insert fails after Order row.
async function createWithStagedWrites(orderData) {
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const payment = orderData.payment;
  const paymentProof = orderData.paymentProof;

  let order;
  try {
    order = await prisma.order.create({
      data: buildOrderCreateData(orderData)
    });
  } catch (err) {
    throw attachDualWriteStage(err, 'Order');
  }

  try {
    for (const item of items) {
      const row = splitOrderItem(item);
      // eslint-disable-next-line no-await-in-loop
      await prisma.orderItem.create({
        data: { orderId: order.id, ...row }
      });
    }
  } catch (err) {
    throw attachDualWriteStage(err, 'OrderItem', order.id);
  }

  let orderPayment = null;
  if (payment && typeof payment === 'object') {
    try {
      orderPayment = await prisma.orderPayment.create({
        data: {
          orderId: order.id,
          methodId: payment.methodId ?? null,
          code: String(payment.code ?? '').trim(),
          name: String(payment.name ?? '').trim(),
          type: toPaymentMethodTypeEnum(payment.type),
          provider: String(payment.provider ?? '').trim(),
          accountNumber: String(payment.accountNumber ?? '').trim(),
          gatewayStoreId: String(payment.gatewayStoreId ?? '').trim(),
          isSandbox: Boolean(payment.isSandbox),
          processingFee: payment.processingFee != null ? payment.processingFee : 0,
          feeType: toFeeTypeEnum(payment.feeType),
          feeRate: payment.feeRate != null ? payment.feeRate : 0,
          feeBaseAmount: payment.feeBaseAmount != null ? payment.feeBaseAmount : 0,
          status: toOrderPaymentStatusEnum(payment.status),
          transactionId: String(payment.transactionId ?? '').trim(),
          gatewayReference: String(payment.gatewayReference ?? '').trim(),
          paidAt: payment.paidAt ?? null,
          settledFromWallet: Boolean(payment.settledFromWallet)
        }
      });
    } catch (err) {
      throw attachDualWriteStage(err, 'OrderPayment', order.id);
    }

    const ipnHistory = Array.isArray(payment.ipnHistory) ? payment.ipnHistory : [];
    try {
      for (const event of ipnHistory) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.orderPaymentIpnEvent.create({
          data: {
            orderPaymentId: orderPayment.id,
            receivedAt: event.receivedAt ?? new Date(),
            provider: String(event.provider ?? '').trim(),
            status: String(event.status ?? '').trim(),
            verified: Boolean(event.verified),
            transactionId: String(event.transactionId ?? '').trim(),
            amount: event.amount != null ? event.amount : 0,
            message: String(event.message ?? '').trim(),
            raw: event.raw ?? null
          }
        });
      }
    } catch (err) {
      throw attachDualWriteStage(err, 'OrderPaymentIpnEvent', order.id);
    }
  }

  if (paymentProof && typeof paymentProof === 'object') {
    try {
      await prisma.orderPaymentProof.create({
        data: {
          orderId: order.id,
          trxId: paymentProof.trxId ?? null,
          screenshotUrl: paymentProof.screenshotUrl ?? null,
          submittedAt: paymentProof.submittedAt ?? null,
          reviewedAt: paymentProof.reviewedAt ?? null,
          reviewedById: paymentProof.reviewedBy ?? paymentProof.reviewedById ?? null,
          status: toPaymentProofStatusEnum(paymentProof.status),
          adminNote: paymentProof.adminNote ?? null
        }
      });
    } catch (err) {
      throw attachDualWriteStage(err, 'OrderPaymentProof', order.id);
    }
  }

  try {
    await prisma.orderNotification.create({
      data: {
        orderId: order.id,
        ...buildNotificationData(orderData)
      }
    });
  } catch (err) {
    throw attachDualWriteStage(err, 'OrderNotification', order.id);
  }

  return findById(order.id);
}

async function create(orderData) {
  return createWithStagedWrites(orderData);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.order.findUnique({
    where: { legacyId: String(legacyId) },
    include: {
      items: true,
      returnItems: true,
      payment: { include: { ipnHistory: { orderBy: { receivedAt: 'asc' } } } },
      paymentProof: true,
      notificationsSent: true
    }
  });
  return orderToShape(record);
}

/**
 * findOrderDetailedByLegacyId — Full 7-table reassembly for read endpoints.
 * Returns shape matching Mongo document exactly: both subTotal and subtotal,
 * out_for_delivery (not outForDelivery), extraFields flattened into items,
 * payment.ipnHistory[], and all child structures as nested objects/arrays.
 * 
 * Used by Stage 4 Step 7 read cutover. Does NOT populate user or product —
 * Mongo reads return bare ObjectIds; controller-level enrichment handles images.
 */
async function findOrderDetailedByLegacyId(legacyId) {
  if (!legacyId) return null;
  
  const order = await prisma.order.findUnique({
    where: { legacyId: String(legacyId) },
    include: {
      items: { orderBy: { id: 'asc' } },
      returnItems: { orderBy: { id: 'asc' } },
      payment: { include: { ipnHistory: { orderBy: { receivedAt: 'asc' } } } },
      paymentProof: true,
      notificationsSent: true
    }
  });
  
  if (!order) return null;
  
  // Items: flatten extraFields back into item properties (Mongo items[] is strict:false)
  const items = (order.items || []).map(mergeOrderItemRow);
  
  // Return items: map to Mongo subdoc shape
  const returnItems = (order.returnItems || []).map((r) => ({
    _id: r.id,
    productId: r.legacyProductId ?? r.productId ?? '',
    productName: r.productName,
    quantity: r.quantity,
    price: Number(r.price),
    reason: r.reason,
    photos: r.photos,
    status: fromReturnItemStatusEnum(r.status)
  }));
  
  // Payment: reassemble ipnHistory[] array
  let payment = null;
  if (order.payment) {
    payment = {
      methodId: order.payment.methodId,
      code: order.payment.code,
      name: order.payment.name,
      type: fromPaymentMethodTypeEnum(order.payment.type),
      provider: order.payment.provider,
      accountNumber: order.payment.accountNumber,
      gatewayStoreId: order.payment.gatewayStoreId,
      isSandbox: order.payment.isSandbox,
      processingFee: Number(order.payment.processingFee),
      feeType: fromFeeTypeEnum(order.payment.feeType),
      feeRate: Number(order.payment.feeRate),
      feeBaseAmount: Number(order.payment.feeBaseAmount),
      status: fromOrderPaymentStatusEnum(order.payment.status),
      transactionId: order.payment.transactionId,
      gatewayReference: order.payment.gatewayReference,
      paidAt: order.payment.paidAt,
      settledFromWallet: order.payment.settledFromWallet,
      ipnHistory: (order.payment.ipnHistory || []).map((e) => ({
        receivedAt: e.receivedAt,
        provider: e.provider,
        status: e.status,
        verified: e.verified,
        transactionId: e.transactionId,
        amount: Number(e.amount),
        message: e.message,
        raw: e.raw
      }))
    };
  }
  
  // Payment proof: 1-to-1
  let paymentProof = null;
  if (order.paymentProof) {
    paymentProof = {
      trxId: order.paymentProof.trxId,
      screenshotUrl: order.paymentProof.screenshotUrl,
      submittedAt: order.paymentProof.submittedAt,
      reviewedAt: order.paymentProof.reviewedAt,
      reviewedBy: order.paymentProof.reviewedById,
      status: fromPaymentProofStatusEnum(order.paymentProof.status),
      adminNote: order.paymentProof.adminNote
    };
  }
  
  // Notifications: map outForDelivery → out_for_delivery
  const notificationsSent = notificationsToMongooseShape(order.notificationsSent);
  
  // Root order: preserve BOTH subTotal and subtotal, use legacyId as _id
  return {
    _id: order.legacyId,
    orderId: order.orderId,
    user: order.userId,  // ObjectId string, not populated
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    shippingDistrict: order.shippingDistrict,
    subTotal: Number(order.subTotal),
    subtotal: Number(order.subtotal),
    deliveryCharge: Number(order.deliveryCharge),
    grandTotal: Number(order.grandTotal),
    shippingLocationType: fromShippingLocationEnum(order.shippingLocationType),
    totalAmount: order.totalAmount != null ? Number(order.totalAmount) : null,
    totalBuyingPrice: Number(order.totalBuyingPrice),
    discountAmount: Number(order.discountAmount),
    vatAmount: Number(order.vatAmount),
    vatPercentage: order.vatPercentage,
    vatEnabled: order.vatEnabled,
    taxRegistrationNumber: order.taxRegistrationNumber,
    walletApplied: Number(order.walletApplied),
    couponCode: order.couponCode,
    deliveryLocationType: fromDeliveryLocationEnum(order.deliveryLocationType),
    shippingFee: Number(order.shippingFee),
    paymentMethod: order.paymentMethod,
    processingFee: Number(order.processingFee),
    status: fromOrderStatusEnum(order.status),
    isDelivered: order.isDelivered,
    deliveredAt: order.deliveredAt,
    cancelReason: order.cancelReason,
    cancelledBy: fromCancelledByEnum(order.cancelledBy),
    returnReason: order.returnReason,
    returnRequestedAt: order.returnRequestedAt,
    refundMethod: order.refundMethod,
    refundBkashNumber: order.refundBkashNumber,
    refundNagadNumber: order.refundNagadNumber,
    returnRejectedReason: order.returnRejectedReason,
    returnRejectedAt: order.returnRejectedAt,
    returnApprovedAt: order.returnApprovedAt,
    adminReturnNote: order.adminReturnNote,
    actionReason: order.actionReason,
    refundedAt: order.refundedAt,
    refundAmount: Number(order.refundAmount),
    statusBeforeRefund: order.statusBeforeRefund,
    rewardsCredited: order.rewardsCredited,
    rewardsPointsEarned: order.rewardsPointsEarned,
    rewardsCashbackAmount: Number(order.rewardsCashbackAmount),
    courierProvider: order.courierProvider,
    courierName: order.courierName,
    courierTrackingId: order.courierTrackingId,
    courierConsignmentId: order.courierConsignmentId,
    courierStatus: order.courierStatus,
    courierBookedAt: order.courierBookedAt,
    courierSyncedAt: order.courierSyncedAt,
    note: order.note,
    estimatedDelivery: order.estimatedDelivery,
    orderSource: order.orderSource,
    createdByAdmin: order.createdByAdmin,
    assignedStaffId: order.assignedStaffId,
    assignedAt: order.assignedAt,
    isSandbox: order.isSandbox,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    __v: 0,  // Mongoose version key
    items,
    returnItems,
    payment,
    paymentProof,
    notificationsSent
  };
}

async function mapItemsWithResolvedProducts(items = []) {
  const mapped = [];
  for (const item of items) {
    const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item };
    const mongoRef = plain.productId || plain.id || plain._id;
    const pgProductId = await resolveProductIdForOrderItem(mongoRef);
    mapped.push({
      ...plain,
      productId: pgProductId || plain.productId
    });
  }
  return mapped;
}

async function buildCreateInputFromMongo(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : { ...mongoDoc };
  const userRef = plain.user?._id || plain.user || null;
  const pgUserId = await resolvePostgresUserId(userRef);
  const items = await mapItemsWithResolvedProducts(plain.items || []);

  return {
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null,
    orderId: plain.orderId,
    userId: pgUserId,
    customerName: plain.customerName,
    customerPhone: plain.customerPhone,
    customerAddress: plain.customerAddress,
    subTotal: plain.subTotal,
    subtotal: plain.subtotal,
    deliveryCharge: plain.deliveryCharge,
    grandTotal: plain.grandTotal,
    shippingLocationType: plain.shippingLocationType,
    shippingDistrict: plain.shippingDistrict,
    totalAmount: plain.totalAmount,
    totalBuyingPrice: plain.totalBuyingPrice,
    discountAmount: plain.discountAmount,
    vatAmount: plain.vatAmount,
    vatPercentage: plain.vatPercentage,
    vatEnabled: plain.vatEnabled,
    taxRegistrationNumber: plain.taxRegistrationNumber,
    walletApplied: plain.walletApplied,
    couponCode: plain.couponCode,
    deliveryLocationType: plain.deliveryLocationType,
    shippingFee: plain.shippingFee,
    paymentMethod: plain.paymentMethod,
    processingFee: plain.processingFee,
    status: plain.status,
    isDelivered: plain.isDelivered,
    deliveredAt: plain.deliveredAt,
    cancelReason: plain.cancelReason,
    cancelledBy: plain.cancelledBy,
    returnReason: plain.returnReason,
    returnRequestedAt: plain.returnRequestedAt,
    refundMethod: plain.refundMethod,
    refundBkashNumber: plain.refundBkashNumber,
    refundNagadNumber: plain.refundNagadNumber,
    returnRejectedReason: plain.returnRejectedReason,
    returnRejectedAt: plain.returnRejectedAt,
    returnApprovedAt: plain.returnApprovedAt,
    adminReturnNote: plain.adminReturnNote,
    actionReason: plain.actionReason,
    refundedAt: plain.refundedAt,
    refundAmount: plain.refundAmount,
    statusBeforeRefund: plain.statusBeforeRefund,
    rewardsCredited: plain.rewardsCredited,
    rewardsPointsEarned: plain.rewardsPointsEarned,
    rewardsCashbackAmount: plain.rewardsCashbackAmount,
    courierProvider: plain.courierProvider,
    courierName: plain.courierName,
    courierTrackingId: plain.courierTrackingId,
    courierConsignmentId: plain.courierConsignmentId,
    courierStatus: plain.courierStatus,
    courierBookedAt: plain.courierBookedAt,
    courierSyncedAt: plain.courierSyncedAt,
    note: plain.note,
    estimatedDelivery: plain.estimatedDelivery,
    orderSource: plain.orderSource,
    createdByAdmin: plain.createdByAdmin,
    assignedStaffId: plain.assignedStaffId,
    assignedAt: plain.assignedAt,
    isSandbox: plain.isSandbox,
    items,
    payment: plain.payment,
    paymentProof: plain.paymentProof,
    notificationsSent: plain.notificationsSent
  };
}

async function createFromMongo(mongoDoc) {
  const input = await buildCreateInputFromMongo(mongoDoc);
  return createWithStagedWrites(input);
}

async function resolvePostgresOrderId(mongoOrderId) {
  if (!mongoOrderId) return null;
  const row = await findByLegacyId(String(mongoOrderId));
  return row ? row.id : null;
}

function pickStatusFieldUpdates(plain) {
  const data = {};
  if (plain.status !== undefined) data.status = toOrderStatusEnum(plain.status);
  if (plain.isDelivered !== undefined) data.isDelivered = Boolean(plain.isDelivered);
  if (plain.deliveredAt !== undefined) data.deliveredAt = plain.deliveredAt;
  if (plain.cancelReason !== undefined) data.cancelReason = String(plain.cancelReason ?? '').trim();
  if (plain.cancelledBy !== undefined) data.cancelledBy = toCancelledByEnum(plain.cancelledBy);
  if (plain.returnReason !== undefined) data.returnReason = String(plain.returnReason ?? '').trim();
  if (plain.returnRequestedAt !== undefined) data.returnRequestedAt = plain.returnRequestedAt;
  if (plain.returnRejectedReason !== undefined) {
    data.returnRejectedReason = String(plain.returnRejectedReason ?? '').trim();
  }
  if (plain.returnRejectedAt !== undefined) data.returnRejectedAt = plain.returnRejectedAt;
  if (plain.returnApprovedAt !== undefined) data.returnApprovedAt = plain.returnApprovedAt;
  if (plain.adminReturnNote !== undefined) data.adminReturnNote = String(plain.adminReturnNote ?? '').trim();
  if (plain.refundedAt !== undefined) data.refundedAt = plain.refundedAt;
  if (plain.refundAmount !== undefined) data.refundAmount = plain.refundAmount;
  if (plain.refundMethod !== undefined) data.refundMethod = toRefundMethodEnum(plain.refundMethod);
  if (plain.statusBeforeRefund !== undefined) {
    data.statusBeforeRefund = String(plain.statusBeforeRefund ?? '').trim();
  }
  if (plain.courierProvider !== undefined) data.courierProvider = String(plain.courierProvider ?? '').trim();
  if (plain.courierName !== undefined) data.courierName = String(plain.courierName ?? '').trim();
  if (plain.courierTrackingId !== undefined) {
    data.courierTrackingId = String(plain.courierTrackingId ?? '').trim();
  }
  if (plain.courierConsignmentId !== undefined) {
    data.courierConsignmentId = String(plain.courierConsignmentId ?? '').trim();
  }
  if (plain.courierStatus !== undefined) data.courierStatus = String(plain.courierStatus ?? '').trim();
  if (plain.courierBookedAt !== undefined) data.courierBookedAt = plain.courierBookedAt;
  if (plain.courierSyncedAt !== undefined) data.courierSyncedAt = plain.courierSyncedAt;
  return data;
}

async function updateStatusByLegacyId(legacyId, newStatus) {
  const existing = await prisma.order.findUnique({ where: { legacyId: String(legacyId) } });
  if (!existing) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const record = await prisma.order.update({
    where: { legacyId: String(legacyId) },
    data: { status: toOrderStatusEnum(newStatus) }
  });

  return orderToShape({ ...record, items: [], returnItems: [], notificationsSent: null });
}

async function updateOrderFieldsByLegacyId(legacyId, fieldUpdates) {
  const existing = await prisma.order.findUnique({ where: { legacyId: String(legacyId) } });
  if (!existing) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const data = pickStatusFieldUpdates(fieldUpdates);
  if (Object.keys(data).length === 0) return findByLegacyId(legacyId);

  const record = await prisma.order.update({
    where: { legacyId: String(legacyId) },
    data
  });

  return orderToShape({ ...record, items: [], returnItems: [], notificationsSent: null });
}

async function updateNotificationsByLegacyId(legacyId, notificationsSent) {
  const order = await prisma.order.findUnique({ where: { legacyId: String(legacyId) } });
  if (!order) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const data = buildNotificationData({ notificationsSent });

  const existing = await prisma.orderNotification.findUnique({ where: { orderId: order.id } });
  if (existing) {
    await prisma.orderNotification.update({
      where: { orderId: order.id },
      data
    });
  } else {
    await prisma.orderNotification.create({
      data: { orderId: order.id, ...data }
    });
  }

  return findByLegacyId(legacyId);
}

async function syncReturnItemsByLegacyId(legacyId, returnItems = []) {
  const order = await prisma.order.findUnique({ where: { legacyId: String(legacyId) } });
  if (!order) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.orderReturnItem.deleteMany({ where: { orderId: order.id } });

  for (const item of returnItems) {
    const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item };
    const mongoRef = plain.productId;
    const pgProductId = await resolveProductIdForOrderItem(mongoRef);
    const legacyProductId = mongoRef != null ? String(mongoRef) : '';
    // eslint-disable-next-line no-await-in-loop
    await prisma.orderReturnItem.create({
      data: {
        orderId: order.id,
        productId: pgProductId,
        legacyProductId,
        productName: String(plain.productName ?? '').trim(),
        quantity: plain.quantity != null ? Number(plain.quantity) : 1,
        price: plain.price != null ? plain.price : 0,
        reason: String(plain.reason ?? '').trim(),
        photos: Array.isArray(plain.photos) ? plain.photos : [],
        status: toReturnItemStatusEnum(plain.status)
      }
    });
  }

  return findByLegacyId(legacyId);
}

async function updatePaymentByLegacyId(legacyId, paymentData) {
  const order = await prisma.order.findUnique({ where: { legacyId: String(legacyId) } });
  if (!order) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await updatePayment(order.id, paymentData);
  return findByLegacyId(legacyId);
}

async function addPaymentIpnEventByLegacyId(legacyId, eventData) {
  const order = await prisma.order.findUnique({ where: { legacyId: String(legacyId) } });
  if (!order) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await addPaymentIpnEvent(order.id, eventData);
  return findByLegacyId(legacyId);
}

async function upsertPaymentProofByLegacyId(legacyId, paymentProof) {
  const order = await prisma.order.findUnique({ where: { legacyId: String(legacyId) } });
  if (!order) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const data = {
    trxId: paymentProof.trxId ?? null,
    screenshotUrl: paymentProof.screenshotUrl ?? null,
    submittedAt: paymentProof.submittedAt ?? null,
    reviewedAt: paymentProof.reviewedAt ?? null,
    reviewedById: paymentProof.reviewedBy ?? paymentProof.reviewedById ?? null,
    status: toPaymentProofStatusEnum(paymentProof.status),
    adminNote: paymentProof.adminNote ?? null
  };

  const existing = await prisma.orderPaymentProof.findUnique({ where: { orderId: order.id } });
  if (existing) {
    await prisma.orderPaymentProof.update({ where: { orderId: order.id }, data });
  } else {
    await prisma.orderPaymentProof.create({ data: { orderId: order.id, ...data } });
  }

  return findByLegacyId(legacyId);
}

async function findById(id) {
  if (!id) return null;
  const record = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      returnItems: true,
      payment: { include: { ipnHistory: { orderBy: { receivedAt: 'asc' } } } },
      paymentProof: true,
      notificationsSent: true
    }
  });
  return orderToShape(record);
}

async function findAll(filters = {}) {
  const where = {};

  if (filters.status) where.status = toOrderStatusEnum(filters.status);
  if (filters.userId || filters.user) where.userId = filters.userId || filters.user;

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const query = {
    where,
    orderBy: { createdAt: 'desc' }
  };

  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }

  const records = await prisma.order.findMany({
    ...query,
    include: { items: true, notificationsSent: true }
  });

  return records.map(orderToShape);
}

/**
 * findAllDetailedByLegacyIds — Batch-fetch multiple orders with full reassembly.
 * For list views: returns summary shape (items included but not payment/proof/returns
 * unless explicitly needed). Optimized to avoid N+1 on child tables.
 * 
 * @param {Object} filters - { userId, status, limit, page, sort }
 * @returns {Array} Array of Mongo-shaped order documents
 */
async function findAllDetailed(filters = {}) {
  const where = {};
  
  if (filters.status) where.status = toOrderStatusEnum(filters.status);
  if (filters.userId || filters.user) where.userId = filters.userId || filters.user;
  
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }
  
  const query = {
    where,
    orderBy: filters.sort === 'updatedAt' 
      ? { updatedAt: 'desc' } 
      : { createdAt: 'desc' }
  };
  
  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }
  
  // List view: include items + notifications only (not payment/proof/returns)
  // Caller enriches images separately; this matches Mongo list behavior
  const orders = await prisma.order.findMany({
    ...query,
    include: {
      items: { orderBy: { id: 'asc' } },
      notificationsSent: true
    }
  });
  
  return orders.map((order) => ({
    _id: order.legacyId,
    orderId: order.orderId,
    user: order.userId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    shippingDistrict: order.shippingDistrict,
    subTotal: Number(order.subTotal),
    subtotal: Number(order.subtotal),
    deliveryCharge: Number(order.deliveryCharge),
    grandTotal: Number(order.grandTotal),
    shippingLocationType: fromShippingLocationEnum(order.shippingLocationType),
    totalAmount: order.totalAmount != null ? Number(order.totalAmount) : null,
    totalBuyingPrice: Number(order.totalBuyingPrice),
    discountAmount: Number(order.discountAmount),
    vatAmount: Number(order.vatAmount),
    vatPercentage: order.vatPercentage,
    vatEnabled: order.vatEnabled,
    taxRegistrationNumber: order.taxRegistrationNumber,
    walletApplied: Number(order.walletApplied),
    couponCode: order.couponCode,
    deliveryLocationType: fromDeliveryLocationEnum(order.deliveryLocationType),
    shippingFee: Number(order.shippingFee),
    paymentMethod: order.paymentMethod,
    processingFee: Number(order.processingFee),
    status: fromOrderStatusEnum(order.status),
    isDelivered: order.isDelivered,
    deliveredAt: order.deliveredAt,
    cancelReason: order.cancelReason,
    cancelledBy: fromCancelledByEnum(order.cancelledBy),
    returnReason: order.returnReason,
    returnRequestedAt: order.returnRequestedAt,
    refundMethod: order.refundMethod,
    refundBkashNumber: order.refundBkashNumber,
    refundNagadNumber: order.refundNagadNumber,
    returnRejectedReason: order.returnRejectedReason,
    returnRejectedAt: order.returnRejectedAt,
    returnApprovedAt: order.returnApprovedAt,
    adminReturnNote: order.adminReturnNote,
    actionReason: order.actionReason,
    refundedAt: order.refundedAt,
    refundAmount: Number(order.refundAmount),
    statusBeforeRefund: order.statusBeforeRefund,
    rewardsCredited: order.rewardsCredited,
    rewardsPointsEarned: order.rewardsPointsEarned,
    rewardsCashbackAmount: Number(order.rewardsCashbackAmount),
    courierProvider: order.courierProvider,
    courierName: order.courierName,
    courierTrackingId: order.courierTrackingId,
    courierConsignmentId: order.courierConsignmentId,
    courierStatus: order.courierStatus,
    courierBookedAt: order.courierBookedAt,
    courierSyncedAt: order.courierSyncedAt,
    note: order.note,
    estimatedDelivery: order.estimatedDelivery,
    orderSource: order.orderSource,
    createdByAdmin: order.createdByAdmin,
    assignedStaffId: order.assignedStaffId,
    assignedAt: order.assignedAt,
    isSandbox: order.isSandbox,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    __v: 0,
    items: (order.items || []).map(mergeOrderItemRow),
    notificationsSent: notificationsToMongooseShape(order.notificationsSent)
  }));
}

async function updateStatus(id, newStatus) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const record = await prisma.order.update({
    where: { id },
    data: { status: toOrderStatusEnum(newStatus) }
  });

  return orderToShape({ ...record, items: [], returnItems: [], notificationsSent: null });
}

async function addReturnItem(orderId, returnItemData) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const legacyProductId = returnItemData.productId != null
    ? String(returnItemData.productId)
    : '';
  const productId = await resolveProductIdForOrderItem(legacyProductId);

  const row = await prisma.orderReturnItem.create({
    data: {
      orderId,
      productId,
      legacyProductId,
      productName: String(returnItemData.productName ?? '').trim(),
      quantity: returnItemData.quantity != null ? Number(returnItemData.quantity) : 1,
      price: returnItemData.price != null ? returnItemData.price : 0,
      reason: String(returnItemData.reason ?? '').trim(),
      photos: Array.isArray(returnItemData.photos) ? returnItemData.photos : [],
      status: toReturnItemStatusEnum(returnItemData.status)
    }
  });

  return {
    _id: row.id,
    productId: row.legacyProductId ?? row.productId ?? '',
    productName: row.productName,
    quantity: row.quantity,
    price: Number(row.price),
    reason: row.reason,
    photos: row.photos,
    status: fromReturnItemStatusEnum(row.status)
  };
}

async function listReturnItems(orderId) {
  const rows = await prisma.orderReturnItem.findMany({
    where: { orderId },
    orderBy: { id: 'asc' }
  });

  return rows.map((row) => ({
    _id: row.id,
    productId: row.legacyProductId ?? row.productId ?? '',
    productName: row.productName,
    quantity: row.quantity,
    price: Number(row.price),
    reason: row.reason,
    photos: row.photos,
    status: fromReturnItemStatusEnum(row.status)
  }));
}

async function updatePayment(orderId, paymentData) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    const err = new Error('Order not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const data = {
    methodId: paymentData.methodId ?? undefined,
    code: paymentData.code !== undefined ? String(paymentData.code).trim() : undefined,
    name: paymentData.name !== undefined ? String(paymentData.name).trim() : undefined,
    type: paymentData.type !== undefined ? toPaymentMethodTypeEnum(paymentData.type) : undefined,
    provider: paymentData.provider !== undefined ? String(paymentData.provider).trim() : undefined,
    accountNumber: paymentData.accountNumber !== undefined
      ? String(paymentData.accountNumber).trim()
      : undefined,
    gatewayStoreId: paymentData.gatewayStoreId !== undefined
      ? String(paymentData.gatewayStoreId).trim()
      : undefined,
    isSandbox: paymentData.isSandbox !== undefined ? Boolean(paymentData.isSandbox) : undefined,
    processingFee: paymentData.processingFee !== undefined ? paymentData.processingFee : undefined,
    feeType: paymentData.feeType !== undefined ? toFeeTypeEnum(paymentData.feeType) : undefined,
    feeRate: paymentData.feeRate !== undefined ? paymentData.feeRate : undefined,
    feeBaseAmount: paymentData.feeBaseAmount !== undefined ? paymentData.feeBaseAmount : undefined,
    status: paymentData.status !== undefined
      ? toOrderPaymentStatusEnum(paymentData.status)
      : undefined,
    transactionId: paymentData.transactionId !== undefined
      ? String(paymentData.transactionId).trim()
      : undefined,
    gatewayReference: paymentData.gatewayReference !== undefined
      ? String(paymentData.gatewayReference).trim()
      : undefined,
    paidAt: paymentData.paidAt !== undefined ? paymentData.paidAt : undefined,
    settledFromWallet: paymentData.settledFromWallet !== undefined
      ? Boolean(paymentData.settledFromWallet)
      : undefined
  };

  Object.keys(data).forEach((k) => {
    if (data[k] === undefined) delete data[k];
  });

  const existing = await prisma.orderPayment.findUnique({ where: { orderId } });
  if (existing) {
    await prisma.orderPayment.update({ where: { orderId }, data });
  } else {
    await prisma.orderPayment.create({
      data: {
        orderId,
        code: '',
        name: '',
        type: 'MANUAL',
        provider: '',
        accountNumber: '',
        gatewayStoreId: '',
        isSandbox: false,
        processingFee: 0,
        feeType: 'PERCENTAGE',
        feeRate: 0,
        feeBaseAmount: 0,
        status: 'UNPAID',
        transactionId: '',
        gatewayReference: '',
        settledFromWallet: false,
        ...data
      }
    });
  }

  return findById(orderId);
}

async function addPaymentIpnEvent(orderId, eventData) {
  let payment = await prisma.orderPayment.findUnique({ where: { orderId } });
  if (!payment) {
    payment = await prisma.orderPayment.create({
      data: {
        orderId,
        code: '',
        name: '',
        type: 'MANUAL',
        provider: '',
        accountNumber: '',
        gatewayStoreId: '',
        isSandbox: false,
        processingFee: 0,
        feeType: 'PERCENTAGE',
        feeRate: 0,
        feeBaseAmount: 0,
        status: 'UNPAID',
        transactionId: '',
        gatewayReference: '',
        settledFromWallet: false
      }
    });
  }

  await prisma.orderPaymentIpnEvent.create({
    data: {
      orderPaymentId: payment.id,
      receivedAt: eventData.receivedAt ?? new Date(),
      provider: String(eventData.provider ?? '').trim(),
      status: String(eventData.status ?? '').trim(),
      verified: Boolean(eventData.verified),
      transactionId: String(eventData.transactionId ?? '').trim(),
      amount: eventData.amount != null ? eventData.amount : 0,
      message: String(eventData.message ?? '').trim(),
      raw: eventData.raw ?? null
    }
  });

  return findById(orderId);
}

module.exports = {
  create,
  createWithStagedWrites,
  createFromMongo,
  buildCreateInputFromMongo,
  findById,
  findByLegacyId,
  findOrderDetailedByLegacyId,
  findAll,
  findAllDetailed,
  updateStatus,
  updateStatusByLegacyId,
  updateOrderFieldsByLegacyId,
  updateNotificationsByLegacyId,
  syncReturnItemsByLegacyId,
  updatePaymentByLegacyId,
  addPaymentIpnEventByLegacyId,
  upsertPaymentProofByLegacyId,
  resolvePostgresOrderId,
  resolveProductIdForOrderItem,
  addReturnItem,
  listReturnItems,
  updatePayment,
  addPaymentIpnEvent,
  splitOrderItem,
  buildNotificationData,
  toOrderStatusEnum,
  fromOrderStatusEnum
};
