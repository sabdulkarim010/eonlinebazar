/********************************************************************
 * Project: EonlineBazar
 * File: attributeRoutes.js
 * Location: routes/attributeRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: প্রোডাক্ট অ্যাট্রিবিউট (Size/Color ইত্যাদি) ম্যানেজমেন্টের REST
 * API রাউট। লজিক attributeController.js-এ; রাউট শুধু এন্ডপয়েন্ট ও নিরাপত্তা
 * (verifyAdmin) ম্যাপ করে। GET পাবলিক; POST/PUT/DELETE কেবল অ্যাডমিন।
 ********************************************************************/

const express = require('express');
const router = express.Router();
const { getAttributes, createAttribute, updateAttribute, deleteAttribute } = require('../controllers/attributeController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// ১. সব অ্যাট্রিবিউট নিয়ে আসা (পাবলিক)
router.get('/', getAttributes);

// ২. নতুন অ্যাট্রিবিউট তৈরি (অ্যাডমিন)
router.post('/', verifyAdmin, createAttribute);

// ৩. অ্যাট্রিবিউট আপডেট (অ্যাডমিন)
router.put('/:id', verifyAdmin, updateAttribute);

// ৪. অ্যাট্রিবিউট ডিলিট (অ্যাডমিন)
router.delete('/:id', verifyAdmin, deleteAttribute);

module.exports = router;
