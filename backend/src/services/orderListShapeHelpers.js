/********************************************************************
 * Project: EonlineBazar
 * File: orderListShapeHelpers.js
 * Location: backend/src/services/orderListShapeHelpers.js
 * Description: Prisma-free helpers for Mongo list-summary order shape parity
 *   (used by Mongo read paths in controllers without loading orderRepository).
 ********************************************************************/

'use strict';

function omitNullFields(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) return obj;
  const copy = { ...obj };
  for (const [key, value] of Object.entries(copy)) {
    if (value === null) delete copy[key];
    else if (value instanceof Date) copy[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      copy[key] = omitNullFields(value);
    }
  }
  return copy;
}

function normalizeVatPercentage(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function notificationsToMongooseShape(notif) {
  const s = notif || {};
  return {
    returnReceived: Boolean(s.returnReceived),
    returnApproved: Boolean(s.returnApproved),
    returnRejected: Boolean(s.returnRejected),
    refundProcessed: Boolean(s.refundProcessed),
    reviewReminder: Boolean(s.reviewReminder),
    processing: Boolean(s.processing),
    shipped: Boolean(s.shipped),
    out_for_delivery: Boolean(s.outForDelivery ?? s.out_for_delivery),
    delivered: Boolean(s.delivered),
    cancelled: Boolean(s.cancelled)
  };
}

function mongoLeanToListSummary(doc) {
  const userRef = doc.user ? String(doc.user) : null;
  const notif = doc.notificationsSent || {};
  return omitNullFields({
    _id: String(doc._id),
    orderId: doc.orderId,
    user: userRef,
    customerName: doc.customerName,
    customerPhone: doc.customerPhone,
    customerAddress: doc.customerAddress,
    shippingDistrict: doc.shippingDistrict ?? '',
    subTotal: doc.subTotal,
    subtotal: doc.subtotal,
    deliveryCharge: doc.deliveryCharge,
    grandTotal: doc.grandTotal,
    shippingLocationType: doc.shippingLocationType,
    totalAmount: doc.totalAmount,
    totalBuyingPrice: doc.totalBuyingPrice,
    discountAmount: doc.discountAmount,
    vatAmount: doc.vatAmount ?? 0,
    vatPercentage: normalizeVatPercentage(doc.vatPercentage),
    vatEnabled: doc.vatEnabled ?? false,
    taxRegistrationNumber: doc.taxRegistrationNumber ?? '',
    walletApplied: doc.walletApplied ?? 0,
    couponCode: doc.couponCode ?? '',
    deliveryLocationType: doc.deliveryLocationType,
    shippingFee: doc.shippingFee,
    paymentMethod: doc.paymentMethod,
    processingFee: doc.processingFee ?? 0,
    status: doc.status,
    isDelivered: doc.isDelivered,
    deliveredAt: doc.deliveredAt,
    cancelReason: doc.cancelReason ?? '',
    cancelledBy: doc.cancelledBy ?? '',
    returnReason: doc.returnReason ?? '',
    returnRequestedAt: doc.returnRequestedAt,
    refundMethod: doc.refundMethod ?? 'wallet',
    refundBkashNumber: doc.refundBkashNumber ?? '',
    refundNagadNumber: doc.refundNagadNumber ?? '',
    returnRejectedReason: doc.returnRejectedReason ?? '',
    returnRejectedAt: doc.returnRejectedAt,
    returnApprovedAt: doc.returnApprovedAt,
    adminReturnNote: doc.adminReturnNote ?? '',
    actionReason: doc.actionReason ?? '',
    refundedAt: doc.refundedAt,
    refundAmount: doc.refundAmount ?? 0,
    statusBeforeRefund: doc.statusBeforeRefund ?? '',
    rewardsCredited: doc.rewardsCredited ?? false,
    rewardsPointsEarned: doc.rewardsPointsEarned ?? 0,
    rewardsCashbackAmount: doc.rewardsCashbackAmount ?? 0,
    courierProvider: doc.courierProvider ?? '',
    courierName: doc.courierName ?? '',
    courierTrackingId: doc.courierTrackingId ?? '',
    courierConsignmentId: doc.courierConsignmentId ?? '',
    courierStatus: doc.courierStatus || 'unbooked',
    courierBookedAt: doc.courierBookedAt,
    courierSyncedAt: doc.courierSyncedAt,
    note: doc.note ?? '',
    estimatedDelivery: doc.estimatedDelivery ?? '',
    orderSource: doc.orderSource ?? 'online',
    createdByAdmin: doc.createdByAdmin ?? '',
    assignedStaffId: doc.assignedStaffId,
    assignedAt: doc.assignedAt,
    isSandbox: doc.isSandbox ?? false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    __v: doc.__v ?? 0,
    items: Array.isArray(doc.items) ? doc.items : [],
    notificationsSent: notificationsToMongooseShape({
      returnReceived: notif.returnReceived,
      returnApproved: notif.returnApproved,
      returnRejected: notif.returnRejected,
      refundProcessed: notif.refundProcessed,
      reviewReminder: notif.reviewReminder,
      processing: notif.processing,
      shipped: notif.shipped,
      outForDelivery: notif.out_for_delivery ?? notif.outForDelivery,
      delivered: notif.delivered,
      cancelled: notif.cancelled
    })
  });
}

module.exports = {
  omitNullFields,
  normalizeVatPercentage,
  notificationsToMongooseShape,
  mongoLeanToListSummary
};
