const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/rbac');

router.post('/:id/reply', verifyAdmin, checkPermission('manage_settings'), contactController.replyContactMessage);

module.exports = router;
