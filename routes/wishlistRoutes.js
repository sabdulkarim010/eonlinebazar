/********************************************************************
 * Project: EonlineBazar
 * File: wishlistRoutes.js
 * Location: routes/wishlistRoutes.js
 * Description: API routes for customer wishlist actions (toggle add/remove).
 ********************************************************************/

const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const { verifyUser } = require('../middlewares/authMiddleware');

router.post('/toggle', verifyUser, wishlistController.toggleWishlist);

module.exports = router;
