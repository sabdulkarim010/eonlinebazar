/********************************************************************
 * Project: EonlineBazar
 * File: productController.js
 * Location: controllers/productController.js
 * Author: Abdul Karim Sheikh
 * Description: Handles fetching, creating, updating, and deleting products 
 * along with Cloudinary image management. Also handles customer reviews.
 ********************************************************************/

const Product = require('../models/product'); 
const Brand = require('../models/brand');
const { upload } = require('../middlewares/uploadMiddleware'); // এখানে শুধু upload ইমপোর্ট হবে
const cloudinary = require('cloudinary').v2; // ক্লাউডিনারি সরাসরি এখান থেকে ইমপোর্ট করুন
const mongoose = require('mongoose');

/**
 * 🌟 হেল্পার: ফ্রন্টএন্ড থেকে আসা variants (JSON string বা array) কে পরিষ্কার,
 * নিরাপদ স্ট্রাকচারে রূপান্তর করে। ফাঁকা/অসম্পূর্ণ সারি বাদ দেয়।
 */
function parseVariants(raw) {
    if (!raw) return [];
    let list = raw;
    if (typeof raw === 'string') {
        try {
            list = JSON.parse(raw);
        } catch (e) {
            return [];
        }
    }
    if (!Array.isArray(list)) return [];

    return list
        .map(v => ({
            attribute: String(v.attribute || '').trim(),
            value: String(v.value || '').trim(),
            sku: String(v.sku || '').trim(),
            price: Number(v.price) || 0,
            buyingPrice: Number(v.buyingPrice) || 0,
            stock: Number(v.stock) || 0
        }))
        // অন্তত অ্যাট্রিবিউট বা ভ্যালু থাকতে হবে, নইলে সারিটি অর্থহীন
        .filter(v => v.attribute || v.value);
}

/**
 * 🌟 হেল্পার: brand ফিল্ড রিসলভ করা। বৈধ ObjectId হলে সেই ব্র্যান্ড খুঁজে
 * { brand, brandName } রিটার্ন করে। খালি/অবৈধ হলে রেফারেন্স ক্লিয়ার করে।
 */
/**
 * 🌟 হেল্পার: highlights/tags-এর মতো অ্যারে ফিল্ড পার্স করা। JSON string,
 * কমা-সেপারেটেড string বা array — সব ফরম্যাট গ্রহণ করে পরিষ্কার অ্যারে দেয়।
 */
function parseStringArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean);
        } catch (e) { /* JSON নয়, নিচে কমা-সেপারেটেড হিসেবে ধরা হবে */ }
        return raw.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
}

// রেগেক্স স্পেশাল ক্যারেক্টার এস্কেপ (ইনজেকশন-নিরাপদ কিওয়ার্ড সার্চ)
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveBrand(brandInput) {
    if (!brandInput || brandInput === 'null' || brandInput === 'undefined') {
        return { brand: null, brandName: '' };
    }
    if (!mongoose.Types.ObjectId.isValid(brandInput)) {
        return { brand: null, brandName: '' };
    }
    const brandDoc = await Brand.findById(brandInput);
    if (!brandDoc) return { brand: null, brandName: '' };
    return { brand: brandDoc._id, brandName: brandDoc.name };
}

// ১. সব প্রোডাক্ট দেখা (পাবলিক)
const getProducts = async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products); 
    } catch (err) {
        console.error("Error fetching products:", err);
        res.status(500).json({ success: false, message: "Failed to fetch products" });
    }
};

/**
 * 🌟 ১বি. অ্যাডভান্সড সার্চ (পাবলিক) — GET /api/products/search?q=keyword
 * ------------------------------------------------------------------
 * Daraz/Shopify স্টাইল কিওয়ার্ড রাউটিং। একটি কিওয়ার্ড দিয়ে প্রোডাক্ট
 * টাইটেল, ডেসক্রিপশন, ট্যাগ, ক্যাটাগরি নাম ও ব্র্যান্ড নামে গভীরভাবে সার্চ করে।
 *
 * কৌশল (hybrid):
 *   ১) partial/fuzzy ম্যাচের জন্য প্রতিটি সার্চযোগ্য ফিল্ডে regex $or ব্যবহার
 *      (যেমন "kamij", "bra", "top" আংশিক শব্দও ম্যাচ করবে)।
 *   ২) ব্র্যান্ড রেফারেন্স গভীরভাবে সার্চ: Brand কালেকশনে নাম regex ম্যাচ করে
 *      পাওয়া _id গুলো query-তে $in হিসেবে যোগ করা হয় (deep-populate search)।
 *
 * সাপোর্টেড query params: q, page, limit, sort
 *   sort = price_asc | price_desc | rating | newest | relevance (default)
 */
const searchProducts = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();

        // পেজিনেশন প্যারামস (নিরাপদ সীমার মধ্যে ক্ল্যাম্প করা)
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        // খালি কিওয়ার্ডে খালি রেজাল্ট (অপ্রয়োজনীয় ফুল-স্ক্যান এড়াতে)
        if (!q) {
            return res.json({
                success: true, query: '', count: 0, total: 0,
                page, totalPages: 0, data: []
            });
        }

        // কিওয়ার্ডকে আলাদা শব্দে ভাগ করে প্রতিটি শব্দের নিরাপদ regex তৈরি
        const words = q.split(/\s+/).filter(Boolean);
        const phraseRegex = new RegExp(escapeRegex(q), 'i');
        const wordRegexes = words.map(w => new RegExp(escapeRegex(w), 'i'));

        // 🔎 ডিপ ব্র্যান্ড সার্চ: নাম regex-এ ম্যাচ করা ব্র্যান্ডের _id সংগ্রহ
        const brandIds = await Brand.find({ name: phraseRegex }).distinct('_id');

        // যেসব ফিল্ডে regex সার্চ চলবে
        const searchableFields = [
            'name', 'description', 'detailedDescription',
            'category', 'brandName', 'tags', 'highlights'
        ];

        const orConditions = [];
        // পূর্ণ ফ্রেজ ম্যাচ (সর্বোচ্চ প্রাসঙ্গিকতা)
        searchableFields.forEach(field => orConditions.push({ [field]: phraseRegex }));
        // প্রতিটি আলাদা শব্দের ম্যাচ (রিকল বাড়াতে — multi-word কিওয়ার্ডের জন্য)
        wordRegexes.forEach(re => {
            searchableFields.forEach(field => orConditions.push({ [field]: re }));
        });
        // ম্যাচ করা ব্র্যান্ডের প্রোডাক্ট
        if (brandIds.length > 0) {
            orConditions.push({ brand: { $in: brandIds } });
        }

        const filter = { $or: orConditions };

        // সর্টিং অপশন ম্যাপিং
        let sortOption;
        switch (String(req.query.sort || '').toLowerCase()) {
            case 'price_asc':  sortOption = { price: 1 }; break;
            case 'price_desc': sortOption = { price: -1 }; break;
            case 'rating':
            case 'top':        sortOption = { rating: -1, numOfReviews: -1 }; break;
            case 'newest':     sortOption = { createdAt: -1 }; break;
            // relevance (default): টপ-রেটেড ও নতুন প্রোডাক্টকে অগ্রাধিকার
            default:           sortOption = { rating: -1, numOfReviews: -1, createdAt: -1 };
        }

        // মোট গণনা ও পেজিনেটেড রেজাল্ট সমান্তরালে আনা
        const [total, products] = await Promise.all([
            Product.countDocuments(filter),
            Product.find(filter).sort(sortOption).skip(skip).limit(limit)
        ]);

        return res.json({
            success: true,
            query: q,
            count: products.length,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: products
        });
    } catch (err) {
        console.error('Product Search Error:', err);
        res.status(500).json({ success: false, message: 'Search failed. Please try again.' });
    }
};

// ২. নতুন প্রোডাক্ট যোগ করা (অ্যাডমিন)
const createProduct = async (req, res) => {
    try {
        // 🐛 ডিবাগিংয়ের জন্য: ফ্রন্টএন্ড থেকে কী ডাটা আসছে তা টার্মিনালে প্রিন্ট করবে
        console.log("Request Body:", req.body); 
        console.log("Files received:", req.files ? req.files.length : 0);

        const { id, name, price, buyingPrice, stock, category, brand, variants, icon, description, detailedDescription, highlights, tags } = req.body;
        
        const parsedHighlights = parseStringArray(highlights);
        const parsedTags = parseStringArray(tags);

        // 🌟 ব্র্যান্ড রিসলভ ও ভ্যারিয়েশন পার্স করা
        const { brand: brandRef, brandName } = await resolveBrand(brand);
        const parsedVariants = parseVariants(variants);

        let newProductData = {
            // 🚀 ফিক্স: ফ্রন্টএন্ড থেকে ডাটা না আসলে যেন ক্র্যাশ না করে তার জন্য Fallback ভ্যালু দেওয়া হলো
            productId: id || `PROD-${Date.now()}`, 
            name: name || description || 'Unnamed Product', // Name না থাকলে Description কেই নাম হিসেবে ধরবে
            price: Number(price) || 0,
            buyingPrice: Number(buyingPrice) || 0, // 🌟 ক্রয়মূল্য সংরক্ষণ (Finance প্রফিট হিসাবের জন্য)
            stock: Number(stock) || 0,
            category: category || 'General',
            brand: brandRef,          // 🌟 ব্র্যান্ড রেফারেন্স
            brandName: brandName,     // ক্যাশড ব্র্যান্ড নাম
            variants: parsedVariants, // 🌟 ভ্যারিয়েশন অ্যারে
            icon: icon || '📦',
            description: description || '',
            detailedDescription: detailedDescription || '', 
            highlights: parsedHighlights,
            tags: parsedTags, // 🌟 সার্চ কিওয়ার্ড ট্যাগ
            images: [] 
        };

        if (req.files && req.files.length > 0) {
            let uploadedUrls = [];
            for (const file of req.files) {
                const b64 = Buffer.from(file.buffer).toString("base64");
                const dataURI = "data:" + file.mimetype + ";base64," + b64;
                const result = await cloudinary.uploader.upload(dataURI, { folder: 'eonlinebazar' });
                uploadedUrls.push(result.secure_url);
            }
            newProductData.image = uploadedUrls[0]; 
            newProductData.images = uploadedUrls; 
        }

        const newProduct = new Product(newProductData);
        await newProduct.save();
        res.status(201).json({ success: true, message: "Product added successfully!", data: newProduct });
    } catch (err) {
        console.error("Product Add Error:", err);
        // 🚀 ফিক্স: এখন ফ্রন্টএন্ডের নেটওয়ার্ক ট্যাবে আসল এররটি দেখা যাবে
        res.status(500).json({ 
            success: false, 
            message: "Failed to add new product",
            errorDetail: err.message // এটি দেখে আমরা বুঝতে পারব সমস্যা কোথায়
        });
    }
};



// ৩. প্রোডাক্ট এডিট করা (অ্যাডমিন)
const updateProduct = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        const { name, price, buyingPrice, stock, category, brand, variants, icon, description, detailedDescription, highlights, tags } = req.body;

        let updateFields = {};
        if (name) updateFields.name = name;
        if (price) updateFields.price = Number(price);
        // 🌟 buyingPrice আপডেট: "0" সহ যেকোনো সংখ্যা গ্রহণ করতে undefined/'' চেক করা হয়েছে
        if (buyingPrice !== undefined && buyingPrice !== '') updateFields.buyingPrice = Number(buyingPrice) || 0;
        if (stock) updateFields.stock = Number(stock);
        if (category) updateFields.category = category;
        if (icon) updateFields.icon = icon.trim();

        // 🌟 ব্র্যান্ড আপডেট: পাঠানো হলেই রিসলভ করা (খালি স্ট্রিং = রেফারেন্স ক্লিয়ার)
        if (brand !== undefined) {
            const { brand: brandRef, brandName } = await resolveBrand(brand);
            updateFields.brand = brandRef;
            updateFields.brandName = brandName;
        }

        // 🌟 ভ্যারিয়েশন আপডেট: পাঠানো হলেই সম্পূর্ণ অ্যারে রিপ্লেস করা
        if (variants !== undefined) {
            updateFields.variants = parseVariants(variants);
        }
        if (description) updateFields.description = description;
        if (detailedDescription) updateFields.detailedDescription = detailedDescription;

        if (highlights !== undefined) {
            updateFields.highlights = parseStringArray(highlights);
        }
        if (tags !== undefined) {
            updateFields.tags = parseStringArray(tags);
        }

        let query = mongoose.Types.ObjectId.isValid(productIdParam) ? { _id: productIdParam } : { productId: String(productIdParam) }; 

        if (req.files && req.files.length > 0) {
            const existingProduct = await Product.findOne(query);
            
            if (existingProduct) {
                const imagesToDelete = existingProduct.images && existingProduct.images.length > 0 
                                       ? existingProduct.images 
                                       : (existingProduct.image ? [existingProduct.image] : []);
                
                for (const imgUrl of imagesToDelete) {
                    if (imgUrl.includes('cloudinary.com')) {
                        try {
                            const urlParts = imgUrl.split('/');
                            const filename = urlParts[urlParts.length - 1].split('.')[0];        
                            const folder = urlParts[urlParts.length - 2];      
                            const publicId = `${folder}/${filename}`;
                            await cloudinary.uploader.destroy(publicId);
                        } catch (cloudinaryErr) {
                            console.error("Cloudinary Delete Error:", cloudinaryErr);
                        }
                    }
                }
            }

            let uploadedUrls = [];
            for (const file of req.files) {
                const b64 = Buffer.from(file.buffer).toString("base64");
                const dataURI = "data:" + file.mimetype + ";base64," + b64;
                const result = await cloudinary.uploader.upload(dataURI, { folder: 'eonlinebazar' });
                uploadedUrls.push(result.secure_url);
            }
            updateFields.image = uploadedUrls[0]; 
            updateFields.images = uploadedUrls; 
        }

        const updatedProduct = await Product.findOneAndUpdate(query, { $set: updateFields }, { returnDocument: 'after' });
        if (!updatedProduct) return res.status(404).json({ success: false, message: "Product not found!" });

        res.json({ success: true, message: "Product updated successfully!", data: updatedProduct });
    } catch (err) {
        console.error("Product Update Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ৪. প্রোডাক্ট ডিলিট করা (অ্যাডমিন)
const deleteProduct = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        let query = mongoose.Types.ObjectId.isValid(productIdParam) ? { _id: productIdParam } : { productId: String(productIdParam) }; 

        const productToDelete = await Product.findOne(query);
        if (!productToDelete) return res.status(404).json({ success: false, message: "Product not found!" });

        const imagesToDelete = productToDelete.images && productToDelete.images.length > 0 
                               ? productToDelete.images 
                               : (productToDelete.image ? [productToDelete.image] : []);

        for (const imgUrl of imagesToDelete) {
            if (imgUrl.includes('cloudinary.com')) {
                try {
                    const urlParts = imgUrl.split('/');
                    const filename = urlParts[urlParts.length - 1].split('.')[0];        
                    const folder = urlParts[urlParts.length - 2];      
                    const publicId = `${folder}/${filename}`;
                    await cloudinary.uploader.destroy(publicId);
                } catch (err) {
                    console.error("Cloudinary Delete Error:", err);
                }
            }
        }

        await Product.findOneAndDelete(query);
        res.json({ success: true, message: "Product and its images deleted successfully!" });
    } catch (err) {
        console.error("Product Delete Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ৫. সিঙ্গেল প্রোডাক্টের বিস্তারিত তথ্য দেখা (পাবলিক)
const getProductById = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        let query = mongoose.Types.ObjectId.isValid(productIdParam) ? { _id: productIdParam } : { productId: String(productIdParam) }; 
        const product = await Product.findOne(query);
        if (!product) return res.status(404).json({ success: false, message: "Product not found!" });
        res.json(product);
    } catch (err) {
        console.error("Error fetching single product:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};


module.exports = { 
    getProducts, 
    searchProducts, // 🌟 অ্যাডভান্সড সার্চ এক্সপোর্ট
    createProduct, 
    updateProduct, 
    deleteProduct, 
    getProductById,
};




