/********************************************************************
 * Project: EonlineBazar
 * File: productController.js
 * Location: controllers/productController.js
 * Author: Abdul Karim Sheikh
 * Description: Handles fetching, creating, updating, and deleting products 
 * along with Cloudinary image management. Also handles customer reviews.
 ********************************************************************/

const Product = require('../models/product'); 
const { upload } = require('../middlewares/uploadMiddleware'); // এখানে শুধু upload ইমপোর্ট হবে
const cloudinary = require('cloudinary').v2; // ক্লাউডিনারি সরাসরি এখান থেকে ইমপোর্ট করুন
const mongoose = require('mongoose');

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

// ২. নতুন প্রোডাক্ট যোগ করা (অ্যাডমিন)
const createProduct = async (req, res) => {
    try {
        // 🐛 ডিবাগিংয়ের জন্য: ফ্রন্টএন্ড থেকে কী ডাটা আসছে তা টার্মিনালে প্রিন্ট করবে
        console.log("Request Body:", req.body); 
        console.log("Files received:", req.files ? req.files.length : 0);

        const { id, name, price, buyingPrice, stock, category, icon, description, detailedDescription, highlights } = req.body;
        
        let parsedHighlights = [];
        if (highlights) {
            try {
                parsedHighlights = Array.isArray(highlights) ? highlights : JSON.parse(highlights);
            } catch (e) {
                parsedHighlights = typeof highlights === 'string' ? highlights.split(',').map(item => item.trim()).filter(Boolean) : [];
            }
        }

        let newProductData = {
            // 🚀 ফিক্স: ফ্রন্টএন্ড থেকে ডাটা না আসলে যেন ক্র্যাশ না করে তার জন্য Fallback ভ্যালু দেওয়া হলো
            productId: id || `PROD-${Date.now()}`, 
            name: name || description || 'Unnamed Product', // Name না থাকলে Description কেই নাম হিসেবে ধরবে
            price: Number(price) || 0,
            buyingPrice: Number(buyingPrice) || 0, // 🌟 ক্রয়মূল্য সংরক্ষণ (Finance প্রফিট হিসাবের জন্য)
            stock: Number(stock) || 0,
            category: category || 'General',
            icon: icon || '📦',
            description: description || '',
            detailedDescription: detailedDescription || '', 
            highlights: parsedHighlights,
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
        const { name, price, buyingPrice, stock, category, icon, description, detailedDescription, highlights } = req.body;

        let updateFields = {};
        if (name) updateFields.name = name;
        if (price) updateFields.price = Number(price);
        // 🌟 buyingPrice আপডেট: "0" সহ যেকোনো সংখ্যা গ্রহণ করতে undefined/'' চেক করা হয়েছে
        if (buyingPrice !== undefined && buyingPrice !== '') updateFields.buyingPrice = Number(buyingPrice) || 0;
        if (stock) updateFields.stock = Number(stock);
        if (category) updateFields.category = category;
        if (icon) updateFields.icon = icon.trim();
        if (description) updateFields.description = description;
        if (detailedDescription) updateFields.detailedDescription = detailedDescription;

        if (highlights) {
            try {
                updateFields.highlights = Array.isArray(highlights) ? highlights : JSON.parse(highlights);
            } catch (e) {
                updateFields.highlights = typeof highlights === 'string' ? highlights.split(',').map(item => item.trim()).filter(Boolean) : [];
            }
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

// 🌟 ৬. প্রোডাক্টে কাস্টমারদের রিভিউ ও রেটিং দেওয়া
const createProductReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const productIdParam = req.params.id;

        // আইডি undefined আসছে কি না তা চেক করা
        if (!productIdParam || productIdParam === 'undefined') {
            return res.status(400).json({ success: false, message: "প্রোডাক্ট আইডি পাওয়া যায়নি!" });
        }

        let query = mongoose.Types.ObjectId.isValid(productIdParam) 
                    ? { _id: productIdParam } 
                    : { productId: String(productIdParam) }; 

        const product = await Product.findOne(query);

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found!" });
        }

        if (!product.reviews) {
            product.reviews = [];
        }

        const alreadyReviewed = product.reviews.find(
            (r) => r.user.toString() === req.user.id.toString()
        );

        if (alreadyReviewed) {
            return res.status(400).json({ success: false, message: "আপনি ইতিমধ্যে এই প্রোডাক্টটির রিভিউ দিয়েছেন।" });
        }

        // 🌟 ফিক্স: ইউজারের নাম না পেলে "Verified Customer" দেখাবে
        const review = {
            user: req.user.id,
            name: req.user.name || "Verified Customer", 
            rating: Number(rating),
            comment,
            createdAt: new Date()
        };

        product.reviews.push(review);
        product.numOfReviews = product.reviews.length;
        product.rating = product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length;

        await product.save();
        res.status(201).json({ success: true, message: "ধন্যবাদ! আপনার রিভিউ সফলভাবে যুক্ত হয়েছে।" });

    } catch (err) {
        console.error("Product Review Error:", err);
        res.status(500).json({ success: false, message: "Server error while adding review." });
    }
};


module.exports = { 
    getProducts, 
    createProduct, 
    updateProduct, 
    deleteProduct, 
    getProductById,
    createProductReview // 🌟 এক্সপোর্ট করা হলো
};




