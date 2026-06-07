const Product = require('../models/Product'); // ক্যাপিটাল 'P' বা স্মল 'p' আপনার ফাইলের নাম অনুযায়ী ঠিক রাখবেন
const { cloudinary } = require('../middlewares/uploadMiddleware');
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
        const { id, name, price, stock, category, icon, description, detailedDescription, highlights } = req.body;
        
        let parsedHighlights = [];
        if (highlights) {
            try {
                parsedHighlights = Array.isArray(highlights) ? highlights : JSON.parse(highlights);
            } catch (e) {
                parsedHighlights = typeof highlights === 'string' ? highlights.split(',').map(item => item.trim()).filter(Boolean) : [];
            }
        }

        let newProductData = {
            productId: id,
            name,
            price: Number(price),
            stock: Number(stock),
            category: category || 'General',
            icon: icon || '📦',
            description: description || '',
            detailedDescription: detailedDescription || '', 
            highlights: parsedHighlights,
            images: [] // ডিফল্ট খালি অ্যারে
        };

        // একাধিক ছবি আপলোড হ্যান্ডেলিং
        if (req.files && req.files.length > 0) {
            let uploadedUrls = [];
            for (const file of req.files) {
                const b64 = Buffer.from(file.buffer).toString("base64");
                const dataURI = "data:" + file.mimetype + ";base64," + b64;
                const result = await cloudinary.uploader.upload(dataURI, { folder: 'eonlinebazar' });
                uploadedUrls.push(result.secure_url);
            }
            newProductData.image = uploadedUrls[0]; // ১ম ছবি থাম্বনেইল হিসেবে থাকবে
            newProductData.images = uploadedUrls; // সবগুলো ছবি অ্যারেতে সেভ হবে
        }

        const newProduct = new Product(newProductData);
        await newProduct.save();
        res.status(201).json({ success: true, message: "Product added successfully!", data: newProduct });
    } catch (err) {
        console.error("Product Add Error:", err);
        res.status(500).json({ success: false, message: "Failed to add new product" });
    }
};

// ৩. প্রোডাক্ট এডিট করা (অ্যাডমিন)
const updateProduct = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        const { name, price, stock, category, icon, description, detailedDescription, highlights } = req.body;

        let updateFields = {};
        if (name) updateFields.name = name;
        if (price) updateFields.price = Number(price);
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

        // যদি নতুন ছবি আপলোড করা হয়, তবে পুরোনো সবগুলো ছবি ডিলিট করতে হবে
        if (req.files && req.files.length > 0) {
            const existingProduct = await Product.findOne(query);
            
            // 🌟 ফিক্স: পুরোনো সব ছবি ক্লাউডিনারি থেকে মুছুন
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

            // নতুন ছবি আপলোড
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

        // 🌟 ফিক্স: প্রোডাক্ট ডিলিট করার সময় ক্লাউডিনারি থেকে এর সবগুলো ছবি মুছে ফেলুন
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

        // ডাটাবেজ থেকে মুছে ফেলা
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

module.exports = { getProducts, createProduct, updateProduct, deleteProduct, getProductById };




