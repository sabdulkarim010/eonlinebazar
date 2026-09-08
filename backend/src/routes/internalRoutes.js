const express = require('express');
const { verifyInternalService } = require('../middlewares/internalServiceAuth');
const {
    getInternalCustomerProfile,
    getInternalCustomerOrders,
    getInternalOrderById,
    updateInternalAdminImage,
} = require('../controllers/internalChatController');

const router = express.Router();

router.use(verifyInternalService);

/** GET /api/internal/customers/:id — profile snapshot for chat CRM */
router.get('/customers/:id', getInternalCustomerProfile);

/** GET /api/internal/customers/:id/orders?limit=5 */
router.get('/customers/:id/orders', getInternalCustomerOrders);

/** GET /api/internal/orders/:id — order detail for chat sidebar */
router.get('/orders/:id', getInternalOrderById);

/** PUT /api/internal/admins/:id/image — chat agent avatar → store Admin.image */
router.put('/admins/:id/image', updateInternalAdminImage);

module.exports = router;
