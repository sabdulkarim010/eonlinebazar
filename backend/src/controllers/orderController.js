/********************************************************************
 * Project: EonlineBazar
 * File: orderController.js
 * Location: backend/src/controllers/orderController.js
 * Description: Compatibility aggregator — re-exports split order controllers.
 ********************************************************************/

const { createOrder } = require('./orderCheckoutController');
const {
    getMyOrders,
    getOrderById,
    downloadOrderInvoice,
    trackOrder,
    cancelUserOrder,
    cancelPendingOrder,
    returnUserOrder,
    returnOrderItems,
    getDashboardStats
} = require('./orderCustomerController');
const {
    createManualOrder,
    getOrders,
    updateOrderShippingAddress,
    masterUpdateOrder,
    updateOrderStatus,
    deleteOrder,
    bulkDeleteOrders,
    approveOrderReturn,
    undoOrderRefund,
    rejectOrderReturn,
    processRefund
} = require('./orderAdminController');
const {
    submitPaymentProof,
    getPendingPaymentProofOrders,
    reviewPaymentProof
} = require('./orderPaymentProofController');

module.exports = {
    createOrder,
    createManualOrder,
    getOrders,
    getMyOrders,
    getOrderById,
    downloadOrderInvoice,
    updateOrderStatus,
    updateOrderShippingAddress,
    masterUpdateOrder,
    deleteOrder,
    bulkDeleteOrders,
    trackOrder,
    getDashboardStats,
    cancelUserOrder,
    cancelPendingOrder,
    returnUserOrder,
    returnOrderItems,
    approveOrderReturn,
    undoOrderRefund,
    rejectOrderReturn,
    processRefund,
    submitPaymentProof,
    getPendingPaymentProofOrders,
    reviewPaymentProof
};
