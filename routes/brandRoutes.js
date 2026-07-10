/********************************************************************
 * Project: EonlineBazar
 * File: brandRoutes.js
 * Location: routes/brandRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: ব্র্যান্ড ম্যানেজমেন্টের REST API রাউট। লজিক এখন
 * brandController.js-এ, রাউট শুধু এন্ডপয়েন্ট ও নিরাপত্তা (verifyAdmin)
 * ম্যাপ করে। GET পাবলিক; POST/PUT/DELETE কেবল অ্যাডমিন।
 ********************************************************************/

const express = require('express');
const router = express.Router();
const { getBrands, createBrand, updateBrand, deleteBrand } = require('../controllers/brandController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// ১. সব ব্র্যান্ড নিয়ে আসা (পাবলিক)
router.get('/', getBrands);

// ২. নতুন ব্র্যান্ড তৈরি (অ্যাডমিন)
router.post('/', verifyAdmin, createBrand);

// ৩. ব্র্যান্ড আপডেট (অ্যাডমিন)
router.put('/:id', verifyAdmin, updateBrand);

// ৪. ব্র্যান্ড ডিলিট (অ্যাডমিন)
router.delete('/:id', verifyAdmin, deleteBrand);

module.exports = router;
