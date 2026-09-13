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
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 5 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const { UUID_PATTERN } = require('./productRepository');

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
    orderId: d.orderId ?? null,
    userId: d.userId ?? d.user ?? null,
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
async function create(orderData) {
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const payment = orderData.payment;
  const paymentProof = orderData.paymentProof;

  const order = await prisma.order.create({
    data: buildOrderCreateData(orderData)
  });

  for (const item of items) {
    const row = splitOrderItem(item);
    // eslint-disable-next-line no-await-in-loop
    await prisma.orderItem.create({
      data: { orderId: order.id, ...row }
    });
  }

  let orderPayment = null;
  if (payment && typeof payment === 'object') {
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

    const ipnHistory = Array.isArray(payment.ipnHistory) ? payment.ipnHistory : [];
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
  }

  if (paymentProof && typeof paymentProof === 'object') {
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
  }

  await prisma.orderNotification.create({
    data: {
      orderId: order.id,
      ...buildNotificationData(orderData)
    }
  });

  return findById(order.id);
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
  let productId = null;
  if (legacyProductId && UUID_PATTERN.test(legacyProductId)) {
    productId = legacyProductId;
  }

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
  findById,
  findAll,
  updateStatus,
  addReturnItem,
  listReturnItems,
  updatePayment,
  addPaymentIpnEvent,
  splitOrderItem,
  buildNotificationData,
  toOrderStatusEnum,
  fromOrderStatusEnum
};
